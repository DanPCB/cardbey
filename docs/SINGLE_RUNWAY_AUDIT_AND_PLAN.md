# Single Runway Audit and Implementation Plan

**Goal:** Unify all execution "runways" into one Mission Execution runtime. Outcome UIs (Draft Review, etc.) become read-only viewers that send intents back to Mission Execution instead of calling AI/agent endpoints directly.

---

## 1) AUDIT RESULTS

### Runway list + backend entrypoints

| Runway | Trigger | Backend entrypoint | State written | Auth / 403–409 notes |
|--------|--------|--------------------|---------------|------------------------|
| **Mission Console (Pipeline)** | User starts mission → DAG run | `stepHandlers.ts` → `postDraftStoreCreate`, `postDraftStoreGenerate`; `dagExecutor.runDag` → `runStepHandler` | Mission (execution, report), DraftStore via core APIs | Mission context; store/draft from mission artifacts |
| **Mission Console (AI Operator)** | Same start; gated by `USE_AI_OPERATOR_FOR_STORE` | `operatorApi.startOperatorMission` → `POST /api/ai-operator/start`; then `getOperatorStatus`, `runOperatorStep` | MissionRun, ConversationThread, artifacts synced to mission | requireAuth; tenant/user from run |
| **Draft Review (StoreDraftReview)** | CTAs: Power Fix, Generate products, Improve dropdown, Use as hero, Fix Image Mismatch, etc. | `POST /api/mi/orchestra/start` (fix_catalog, store_generation, etc.); `startOrchestraTask` + `runOrchestraJob`; `API.storesFixImageMismatch`; suggestImages (menuImages) | Orchestra job, draft/store via job; fix-image-mismatch creates mission run | 403/409 when token missing, wrong store ownership, or draft not in same context as mission |
| **ImproveDropdown** (inside Draft Review) | "Generate tags", "Rewrite descriptions", "Generate hero", Auto-fill, Power Fix | Same: `startOrchestraTask` → `POST /api/mi/orchestra/start`, then `runOrchestraJob` | Job + draft updates | Same as above |
| **MI Assistant sidebar (Agent Mode)** | User asks agent to change draft/store | Agent tools / API calls from sidebar context | Draft/store, possibly new job | 403/409 if sidebar uses different auth/store context than mission |
| **Create with AI / quickstart** | Form, chat, OCR, website entry | Various: draft-store create, generate, orchestra/start | DraftStore, job | Depends on entry; can duplicate context |

### Where execution happens

- **Pipeline:** `dagExecutor.ts` → `runStepHandler` (stepHandlers.ts) → `postDraftStoreCreate` / `postDraftStoreGenerate` → core APIs.
- **AI Operator:** Dashboard calls `startOperatorMission`; backend `aiOperatorRoutes` creates MissionRun, runs `runOperatorStepWithAgents` (fire-and-forget); dashboard polls `getOperatorStatus` and optionally `runOperatorStep`.
- **Draft Review:** Direct `apiPOST('/api/mi/orchestra/start', ...)` and `startOrchestraTask` / `runOrchestraJob` from ImproveDropdown, Power Fix modal, "Generate products", Use as hero, Fix Image Mismatch.

### 403/409 root causes

- **Auth:** Outcome UIs (Draft Review, MI Assistant) call APIs with same token but sometimes without mission-owned store/draft context (e.g. opened via direct URL, different tab).
- **Context duplication:** Multiple UIs can start jobs for the same draft with different `generationRunId` or store identity → conflicts.
- **sync-store:** Frontend calls `POST .../job/:jobId/sync-store` but this route was not found in core; may 404 or live elsewhere — verify and fix or remove.

---

## 2) SINGLE RUNWAY DESIGN (canonical structure)

**Reference:** The canonical Cardbey Single Runway architecture is defined in the project assets (Single Runway Architecture diagram). The following text map and bullets align with that diagram.

### Text map (aligned with diagram)

```
User / Seller ("Create me a store")
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Mission Execution (Single Runway / Control Tower)               │
│  - One entrypoint; action queue + checkpoint questions only here │
│  ◄──► Input Requests / Approvals (Confirm store type? Pick hero? Accept offer?) │
│  ───► MI Orchestrator (routes intent → agents)                    │
│  ◄─── Signals / Analytics (views, scans, bookings, sales)        │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
MI Orchestrator ──► Agent Team (Memory · Context · Build · Match · Optimize)
    │                        │
    │                        ▼
    │              Artifacts / Outcomes (Store · Listings · Slides · Campaigns · QR · Bookings)
    │                        │
    │                        ▼
    │              Unified Dashboard (simple viewer + actions)
    │                        │
    │                        ├──► Cardbey Network (Marketplace + Social + Offline CNET)
    │                        │
    │                        └──► "actions" (IntentRequest) ──► back to Mission / Orchestrator
    │
User / Buyer ("Book nails / find plumber") ──► Input Requests / Approvals ──► Mission Execution
```

- **One canonical execution entrypoint:** Mission Execution (Control Tower). All seller intents and buyer-triggered approvals flow through it.
- **Input Requests / Approvals:** Checkpoint questions (e.g. confirm store type, pick hero image, accept offer) live only in Mission Execution UI; no parallel approval paths from outcome UIs.
- **Unified Dashboard = simple viewer + actions:** Outcome UIs (Draft Review, slideshow, preview, etc.) display artifacts and may request actions; those actions must go back as intents to Mission Execution / MI Orchestrator (e.g. `dispatchMissionIntent`), not as direct store/draft mutations.
- **Signals / Analytics:** Views, scans, bookings, sales from Cardbey Network feed back into Mission Execution for data-driven flow (future enhancement).

---

## 3) IMPLEMENTATION PLAN (M1 / M2 / M3)

### M1 (NOW – 1–2 PRs): Single Runway Gate

- **Goal:** Outcome UIs do not start new execution; they send `IntentRequest` (e.g. via `dispatchMissionIntent`) to Mission Execution. Mission UI shows action queue and runs via orchestrator.
- **Touched files (frontend):**
  - New: `src/lib/missionIntent.ts` (dispatcher + guardrail comment).
  - `features/storeDraft/StoreDraftReview.tsx` (pass `missionId` to ImproveDropdown; optional use of dispatcher for other CTAs later).
  - `features/storeDraft/review/ImproveDropdown.tsx` (when `missionId` present, use `dispatchMissionIntent` for generate_tags, rewrite_descriptions, generate_store_hero instead of direct API).
  - `app/console/ExecutionDrawer.tsx` (optional `pendingIntent` prop to show “Pending: {intent}” in action list; parent reads URL and passes it).
- **Data model:** None. Client-only intent (URL params + optional sessionStorage keyed by missionId).
- **Risks:** Users without missionId in URL still get current (direct) behavior until we fully gate; no regression.
- **Mitigations:** Gate only when `missionId` is present; keep all backend endpoints; add guardrail comment and lint rule guidance.
- **Manual test:** Create store mission from Mission Console → open Draft Review (with missionId in URL) → click “Generate tags” or “Rewrite descriptions” → expect redirect to Mission with intent in URL and no direct orchestra/start call from Draft Review for that action.

### M2 (NEXT): Unify Pipeline vs AI Operator

- **Goal:** One backend mission start; Pipeline and AI Operator are UI modes only; one job record, one missionId, one event stream.
- **Touched files:** Dashboard: Console/start flow, ExecutionDrawer, operator polling. Backend: optional unification of orchestra start and ai-operator start behind one mission start API.
- **Data model:** Possibly single “mission run” record used by both modes.
- **Risks:** Breaking existing Operator or Pipeline flows.
- **Mitigations:** Feature flag; same contract for jobId/missionId/artifacts; incremental migration.
- **Manual test:** Toggle Pipeline vs AI Operator → same mission starts; one job; one timeline.

### M3 (LATER): True agent orchestration

- **Goal:** Agents (Context, Catalog, Copy, Media, QA, Publish) emit events; Mission Execution UI consumes them and asks user at checkpoints.
- **Touched files:** Backend agent/orchestrator events; dashboard ExecutionDrawer and action queue.
- **Data model:** Event schema, checkpoint types. IntentRequest already has optional **agent** (e.g. CopyAgent, CatalogAgent) so orchestrator can route type → agent.
- **Risks:** Scope creep; UI complexity.
- **Mitigations:** Phased rollout; keep M1 gate so outcome UIs still only send intents.

**Enforcement:** No direct AI execution outside Mission Execution. Later: eslint rule or code-search test to block direct `/api/mi/orchestra/start` from artifact code. See `docs/SINGLE_RUNWAY_M1.5_IMPLEMENTATION.md`.

---

## 4) FIRST SLICE IMPLEMENTED (M1)

### Exact files changed

| File | Change |
|------|--------|
| `docs/SINGLE_RUNWAY_AUDIT_AND_PLAN.md` | New: audit, single runway map, M1/M2/M3 plan, manual test checklist. |
| `apps/dashboard/.../src/lib/missionIntent.ts` | New: `dispatchMissionIntent()`, `getIntentLabel()`, guardrail comment. |
| `apps/dashboard/.../src/features/storeDraft/review/ImproveDropdown.tsx` | Added `missionId`, `draftId` props; when `missionId` + gated goal (generate_tags, rewrite_descriptions, generate_store_hero), call `dispatchMissionIntent` instead of orchestra API; guardrail comment. |
| `apps/dashboard/.../src/features/storeDraft/StoreDraftReview.tsx` | Pass `missionId={searchParams.get('missionId')}` and `draftId={baseDraft?.id ?? baseDraft?.meta?.draftId ?? null}` to `ImproveDropdown`. |
| `apps/dashboard/.../src/app/console/ExecutionDrawer.tsx` | Optional prop `pendingIntent`; export `PendingIntent` type; when set, prepend “Pending: {intent}” action card with “Open Draft Review” + “Dismiss”; import `getIntentLabel` from missionIntent. |

### Behavior change

- **Draft Review with missionId in URL:** Clicking “Generate tags”, “Rewrite descriptions”, or “Generate hero” in the Improve dropdown no longer calls `startOrchestraTask`/`runOrchestraJob` directly. It shows a toast “Action queued in Mission. Opening Mission Console…” and navigates to `/app/missions/{missionId}?intent=...`. Execution is intended to be run from Mission Execution UI.
- **Draft Review without missionId:** Unchanged; those actions still start the orchestra job directly.
- **Mission Execution:** If the parent that renders `ExecutionDrawer` passes `pendingIntent` from URL (`?intent=...`), the drawer shows a “Pending: {label}” card in “Your next actions” with link to Draft Review and Dismiss.

### Parent wiring for pendingIntent

The view that renders `ExecutionDrawer` (mission detail page) should read `intent`, `storeId`, `draftId` from `useSearchParams()` and pass:

```ts
pendingIntent={
  searchParams.get('intent')
    ? {
        intentType: searchParams.get('intent')!,
        storeId: searchParams.get('storeId') ?? undefined,
        draftId: searchParams.get('draftId') ?? undefined,
      }
    : null
}
```

### Guardrail

- In `missionIntent.ts`: “DO NOT call AI/agent endpoints directly from artifact pages. Use dispatchMissionIntent.”
- In `ImproveDropdown.tsx`: same guardrail in file header.

---

## 5) OPEN ISSUES / FOLLOW-UPS

- **sync-store:** Resolve whether `POST /api/mi/orchestra/job/:jobId/sync-store` exists; implement or remove frontend call.
- **MI Assistant (Agent Mode):** Replace direct Draft/Store API calls with `dispatchMissionIntent` and “Queued in Mission” + link (full change in a follow-up).
- **Draft Review Power Fix / Generate products / Fix Image Mismatch:** In a later PR, route through `dispatchMissionIntent` when `missionId` is present.
- **Mission page:** Ensure the view that renders ExecutionDrawer reads `intent` from URL and passes `pendingIntent` so the banner/action item appears.

---

## MANUAL TEST CHECKLIST

- [ ] **Create store mission from Mission Console.** Confirm mission runs and Draft Review link includes `missionId` in URL.
- [ ] **Draft Review (with missionId):** Open Draft Review from Mission (so URL has `missionId`). Click “Improve” → “Rewrite descriptions” or “Generate tags”.  
  **Expected:** Toast “Action queued in Mission. Opening Mission Console…”; browser navigates to `/app/missions/{missionId}?intent=rewrite_descriptions` (or `generate_tags`). No direct `POST /api/mi/orchestra/start` from this click.
- [ ] **Mission Execution pending card:** After the redirect above, if the mission page passes `pendingIntent` from URL (see “Parent wiring for pendingIntent” above), Execution Drawer should show “Your next actions” with “Pending: Rewrite descriptions” (or Generate tags) and “Open Draft Review” / “Dismiss”.
- [ ] **Draft Review (without missionId):** Open Draft Review without `missionId` in URL (e.g. direct link). Click “Generate tags”.  
  **Expected:** Current behavior unchanged; orchestra job starts directly.
- [ ] **MI Assistant Agent Mode from draft page:** **Expected (after full C2):** No 403/409; queues intent and links back to mission.
- [ ] **Pipeline vs AI Operator selection:** **Expected:** Both still work; in M2 both route into same mission execution start.
