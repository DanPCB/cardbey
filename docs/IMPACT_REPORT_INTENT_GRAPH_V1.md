# Impact Report: Intent Graph v1

## Goal
After a DraftStore is generated, Cardbey builds a store intent graph: infer 3–5 intents (bakery/café), match offers/items/categories to intents, generate top 3 next-best actions, persist and expose for UI. Rules-first, no graph DB, Prisma only.

## Could this break the current store-generation workflow?

**Risks (mitigated):**

1. **Critical path**  
   - **Risk:** Adding logic into `generateDraft()` or the job runner’s transition path could delay or break draft creation.  
   - **Mitigation:** Intent graph is **not** in the critical path. We add:
     - An **optional** internal API (e.g. `POST /api/intent-graph/build`) and/or a **fire-and-forget** call after the draft is already `ready` (e.g. after `runWorker(d)` in the job runner). The graph build runs **after** the draft is ready; it does not block generation or status transitions.

2. **Database**  
   - **Risk:** New Prisma models/migrations could affect existing migrations or schema.  
   - **Mitigation:** New models only; no changes to `DraftStore`, `OrchestratorTask`, or `Business`. SQLite: use `prisma db push` (or new migration) in a separate step.

3. **Existing `IntentSignal` model**  
   - **Risk:** Schema already has `IntentSignal` (page_view / qr_scan analytics).  
   - **Mitigation:** We do **not** rename or replace it. New graph-related evidence is stored in a new model (e.g. `IntentGraphSignal` or evidence JSON on `OfferIntentMatch` / `IntentNode`) so existing analytics and APIs keep working.

## Smallest safe integration

- **Trigger:** Call intent-graph build only from:
  - **Option A:** New API `POST /api/intent-graph/build?draftId=...` (dashboard or cron). No change to store creation flow.
  - **Option B:** After the job runner sets draft to `ready` and runs `runWorker(d)`, call `buildIntentGraphForDraft(draftId).catch(() => {})` (fire-and-forget). Single call site; no `await`; failures only logged.
- **Writes:** All graph writes in a single Prisma `$transaction` where possible; audit events via existing `AuditEvent` (or equivalent) for graph build start/success/failure.
- **Reads:** New read-only endpoints for suggestions; no change to existing draft-store or store APIs.

## Scope

- **In scope:** New Prisma models, graph writer service, bakery/café rules, offer–intent matching, action suggestion engine, internal API, simple UI panel, audit events.
- **Out of scope:** Changing `generateDraft()`, `transitionDraftStoreStatus`, or any existing draft/commit flow; adding a graph DB; AI-first inference (rules-first only).

---

## Implementation summary (post-change)

### Modified / new files

| Area | File | Change |
|------|------|--------|
| Core – Prisma | `apps/core/cardbey-core/prisma/schema.prisma` | Added 6 models: IntentNode, IntentEdge, IntentGraphSignal, OfferIntentMatch, StoreActionSuggestion, ActionOutcome |
| Core – services | `apps/core/cardbey-core/src/services/intentGraph/intentInferenceRules.js` | New: bakery/café intent inference (rules-only) |
| Core – services | `apps/core/cardbey-core/src/services/intentGraph/offerIntentMatching.js` | New: offer/item/category → intent matching with score + evidence |
| Core – services | `apps/core/cardbey-core/src/services/intentGraph/actionSuggestionEngine.js` | New: top 3 next-best actions (rules-only) |
| Core – services | `apps/core/cardbey-core/src/services/intentGraph/graphWriterService.js` | New: build graph for draft (tx + audit) |
| Core – routes | `apps/core/cardbey-core/src/routes/intentGraphRoutes.js` | New: POST /build, GET /suggestions |
| Core – server | `apps/core/cardbey-core/src/server.js` | Mount `app.use('/api/intent-graph', intentGraphRoutes)` |
| Dashboard – API | `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` | Added getIntentGraphSuggestions, postIntentGraphBuild |
| Dashboard – UI | `apps/dashboard/cardbey-marketing-dashboard/src/features/intentGraph/IntentGraphSuggestionsPanel.tsx` | New: panel with suggestions + Build button |
| Dashboard – UI | `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` | Import and render IntentGraphSuggestionsPanel in left sidebar |
| Docs | `docs/IMPACT_REPORT_INTENT_GRAPH_V1.md` | Impact report + this summary |

### Schema additions (Intent Graph v1)

- **IntentNode:** draftStoreId?, storeId?, intentKey, label, weight, source (rules).
- **IntentEdge:** fromId, toId, kind? (supports | conflicts); relations to IntentNode.
- **IntentGraphSignal:** intentNodeId, signalType, signalValue, strength; evidence for inference.
- **OfferIntentMatch:** intentNodeId, offerType (product | category | item), offerRef, draftStoreId?, storeId?, score, evidence (Json).
- **StoreActionSuggestion:** draftStoreId?, storeId?, rank, actionType, title, description?, payload?, status (active | applied | dismissed | expired).
- **ActionOutcome:** suggestionId, outcome (applied | dismissed | expired), actorType, actorId?.

### New APIs

- **POST /api/intent-graph/build**  
  Body or query: `draftId`. Builds intent graph for the draft (idempotent). Returns `{ ok, intentCount?, matchCount?, suggestionCount? }`. Uses `optionalAuth`; audit events: build start / success / failed.

- **GET /api/intent-graph/suggestions?draftId=... | ?storeId=...**  
  Returns `{ ok, suggestions[], intents[] }` for the UI panel. Cooldown: only returns suggestions where `cooldownUntil` is null or in the past. Uses `optionalAuth`.

- **GET /api/intent-graph/debug?draftId=... | ?storeId=...**  
  Returns full graph for inspection: `nodes`, `edges`, `suggestions` (with outcomes). Uses `optionalAuth`.

---

## Improvements applied (post-review)

- **Idempotent build:** Explicit delete of existing graph for draft before recreate; comment in code.
- **IntentNode:** Added optional `confidence` (0–1) for explainability; `source` kept (rules | ai later). Schema comment: consider **IntentType** table later (intentKey FK) to prevent typo drift and attach metadata (e.g. promote_breakfast, highlight_pastries, birthday_cake_order, coffee_combo).
- **OfferIntentMatch.evidence:** Now includes **scoreBreakdown** `{ categoryFit?, itemFit?, storeTypeBoost?, keywordMatch? }` for debugging.
- **StoreActionSuggestion:** Added **cooldownUntil** (null = show; set on dismiss to avoid repeat). GET /suggestions filters by `cooldownUntil` null or past.
- **GET /intent-graph/debug:** New endpoint returning nodes, edges, signals, matches, suggestions for inspection.

### Recommended next steps (flywheel)

Current milestone: **Store → Intents → Offer matches → Suggestions** (half the flywheel). To reach the full flywheel:

- **Action execution:** Wire suggestion CTAs (e.g. "Create a promotion") to real flows (create promo, add QR, publish).
- **Outcome tracking:** Persist when user applies/dismisses via `ActionOutcome`; set `StoreActionSuggestion.cooldownUntil` on dismiss.
- **Feedback learning:** Use outcomes to improve scoring and ranking (e.g. deprioritize often-dismissed action types).
