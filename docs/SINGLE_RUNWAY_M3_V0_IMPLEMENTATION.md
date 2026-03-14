# Single Runway M3 v0 — Real Agent Execution + Event Stream

## Goal

Upgrade "Run intent" from stub to real agent execution with a single event stream:

- **MissionEvent** append-only store for progress.
- **v0 agents:** CatalogAgent (generate_tags, rewrite_descriptions), MediaAgent (generate_store_hero).
- **POST .../intents/:intentId/run** marks intent running, emits events, runs agent, patches **DraftStore.preview only**, marks completed/failed.
- **Mission Execution UI** shows Agent Timeline (events) live.

## Invariants (confirmed)

- **Single runway:** Outcome UIs do not execute; they queue intents only. Run is triggered only from Mission Execution UI.
- **Preview-only:** v0 agents only patch `DraftStore.preview` JSON (no status, no committedStoreId). No transition service calls.
- **Publish contract:** No changes to publish API.
- **Idempotent:** Running the same intent twice overwrites deterministically (tags/descriptions/hero); no duplication or corruption.

---

## A) Files changed

### Backend (core)

| File | Change |
|------|--------|
| `prisma/sqlite/schema.prisma` | IntentRequest: added **result** (Json?). Added **MissionEvent** (id, missionId, intentId?, agent, type, payload, createdAt). |
| `prisma/postgres/schema.prisma` | Same. |
| `src/routes/miIntentsRoutes.js` | **GET /api/mi/missions/:missionId/events?limit=200** (requireAuth, mission owner). **POST .../intents/:intentId/run** stub replaced: set running → emit started → resolveDraftContext → dispatch to CatalogAgent or MediaAgent → emit progress/completed/failed → set intent status + result. |
| `src/services/miAgents/emitMissionEvent.js` | **New.** `emitMissionEvent({ missionId, intentId?, agent, type, payload })`. |
| `src/services/miAgents/resolveDraftContext.js` | **New.** Resolve draft from payload.draftId \| payload.generationRunId \| payload.storeId; returns { draft, draftId, storeId, generationRunId }. |
| `src/services/miAgents/catalogAgent.js` | **New.** runCatalogAgent: generate_tags (heuristic tags from name/category), rewrite_descriptions (short friendly); emits progress; patchDraftPreview(items only). |
| `src/services/miAgents/mediaAgent.js` | **New.** runMediaAgent: generate_store_hero (existing hero → else first product image → else placeholder); patchDraftPreview(hero, heroImageUrl). |

### Frontend (dashboard)

| File | Change |
|------|--------|
| `src/lib/missionIntent.ts` | **listMissionEvents(missionId, limit)** → GET .../events. **MissionEventItem** type. |
| `src/app/console/ExecutionDrawer.tsx` | Poll **listMissionEvents** every 1.5s when drawer open. **Agent Timeline** section: events grouped by intentId (latest run at top), friendly labels (Started, In progress, Done, Failed). handleRunIntent refetches intents + events after run. |
| `src/features/storeDraft/review/ImproveDropdown.tsx` | Pass **payload: { generationRunId }** in dispatchMissionIntent so backend can resolve draft. |

---

## B) Event schema and sample payloads

**MissionEvent** (append-only):

- **id** (cuid)
- **missionId** (string, indexed)
- **intentId** (string nullable, indexed)
- **agent** (string) e.g. `"orchestrator"` | `"catalog"` | `"media"`
- **type** (string) `started` | `progress` | `needs_input` | `completed` | `failed`
- **payload** (Json, optional)
- **createdAt** (DateTime)

**Sample events:**

1. **Orchestrator started**
   - `{ agent: "orchestrator", type: "started", payload: { intentType: "generate_tags" } }`

2. **Catalog progress**
   - `{ agent: "catalog", type: "progress", payload: { message: "Analyzing catalog" } }`
   - `{ agent: "catalog", type: "progress", payload: { message: "Generating tags" } }`
   - `{ agent: "catalog", type: "progress", payload: { message: "Saving changes" } }`

3. **Catalog completed**
   - `{ agent: "catalog", type: "completed", payload: { ok: true, summary: "Generated tags for N items", fieldsChanged: ["preview.items[].tags"] } }`

4. **Failed (no draft context)**
   - `{ agent: "orchestrator", type: "failed", payload: { message: "No draft context (provide draftId or generationRunId in intent payload)" } }`

5. **Media completed**
   - `{ agent: "media", type: "completed", payload: { ok: true, summary: "Hero image set from catalog", heroImageUrl: "..." } }`

---

## C) How to test

### 1. Backend: schema and server

```bash
cd apps/core/cardbey-core
npx prisma generate --schema prisma/sqlite/schema.prisma
npx prisma db push --schema prisma/sqlite/schema.prisma   # if SQLite
# Restart core server
```

### 2. Create mission and draft (with missionId in URL)

- From Mission Console, start a store mission and wait until you have a draft (or open an existing mission that has a draft).
- Open Draft Review with **missionId** (and ideally **generationRunId** or **draftId**) in the URL.

### 3. Queue intent from Draft Review

- Click **Improve** → **Generate tags** (or **Rewrite descriptions** or **Generate hero**).
- **Expected:** Intent created via POST .../intents; toast "Queuing in Mission Inbox…"; redirect to Mission. No call to `/api/mi/orchestra/start`.

### 4. Run intent from Mission Execution

- In Execution Drawer, find the intent in **Mission Inbox** and click **Run**.
- **Expected:**
  - Intent status → running then completed (or failed if no draft context).
  - **Agent Timeline** shows: Started → progress messages → Done (or Failed).
  - DraftStore.preview updated (tags on items, or descriptions, or hero/heroImageUrl).
- **No** `/api/mi/orchestra/start` used for these intents.

### 5. Idempotency

- Click **Run** again on the same (completed) intent: **Expected** 409 (Intent is not queued).
- Or re-queue the same action from Draft Review and Run again: **Expected** success again; preview overwritten deterministically, no duplicate data.

### 6. cURL (events)

```bash
# Replace MISSION_ID and token
curl -s -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:PORT/api/mi/missions/MISSION_ID/events?limit=50"
# Expect: { "ok": true, "events": [ ... ] }
```

### 7. cURL (run intent)

```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:PORT/api/mi/missions/MISSION_ID/intents/INTENT_ID/run"
# Expect: { "ok": true, "intentId": "...", "status": "completed"|"failed", "result": { ... } }
```

---

## D) Risks and mitigations

| Risk | Mitigation |
|------|------------|
| No draft context (missing draftId/generationRunId in payload) | Frontend passes generationRunId from ImproveDropdown. Backend emits failed event and sets intent status failed with clear message. |
| Draft committed or expired | patchDraftPreview throws; agent run fails; intent set to failed, event emitted. |
| Prisma client missing MissionEvent or IntentRequest.result | Run `prisma generate` after schema change. GET events returns 503 if model unavailable. |
| Concurrent run of same intent | POST run checks intent.status === 'queued'; otherwise 409. |
| Preview shape assumptions | CatalogAgent/MediaAgent use existing preview.items/catalog.products and preview.hero; safe defaults if missing. |

---

## E) Invariants summary

- **Single runway:** Execution only from Mission Execution UI via POST .../intents/:id/run. Outcome UIs only create intents (POST .../intents).
- **Preview-only patching:** v0 agents call only `patchDraftPreview(draftId, { items } | { hero, heroImageUrl })`. No `status`, `committedStoreId`, or transition service.
- **Publish API:** Unchanged.
- **Idempotent:** Same intent run again (after re-queue) overwrites same preview fields; no duplicate rows or corrupt state.
