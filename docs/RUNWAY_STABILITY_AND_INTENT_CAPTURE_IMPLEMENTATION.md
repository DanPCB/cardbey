# Runway Stability + Intent Capture Layer — Implementation Summary

Single Runway and Intent Capture MVP implemented under one contract: only Mission Execution runs; outcome UIs queue intents; one event stream (MissionEvent); minimal diff.

---

## 1) Runway Stability (Workstream A)

### A1) Guardrails to prevent drift

- **`assertNoDirectOrchestraWhenMissionId(missionId)`** added in `apps/dashboard/.../lib/missionIntent.ts`. Call before any path that would call `startOrchestraTask` from an artifact UI; throws if `missionId` is set so callers must use `dispatchMissionIntent`.
- **ImproveDropdown** now calls `assertNoDirectOrchestraWhenMissionId(missionId)` immediately before building the orchestra start payload, so any code path that reaches `startOrchestraTask` when `missionId` is present will throw.
- **Central grepable note:** `docs/SINGLE_RUNWAY_GUARDRAILS.md` — "No direct orchestra from artifact pages" and where the helper lives. `missionIntent.ts` and `orchestraClient.ts` already had guardrail comments; the doc is the single reference.

**Why:** Ensures artifact UIs with `missionId` never call `/api/mi/orchestra/start`; they must create an IntentRequest. Grep for `assertNoDirectOrchestraWhenMissionId` and `no direct orchestra from artifact pages` to enforce.

### A2) Inbox + runner reliability

- **getOrCreateMission on POST /intents:** Before the access check, we now call `getOrCreateMission(missionId, req.user, { title: 'Mission' })` so the Mission row exists when creating an intent (e.g. when `missionId` is an OrchestratorTask id). Access check runs after.
- **Events ordering:** GET `/api/mi/missions/:missionId/events` already returns `orderBy: { createdAt: 'asc' }` (oldest → newest). No change.
- **/run idempotent and safe:** Only queued intents can run (409 otherwise). Handler always emits started → progress* → completed/failed. No change to that contract.
- **No-draft-context error:** When draft context is missing we now:
  - Emit event with `userFriendlyMessage` and `errorCode: 'no_draft_context'`.
  - Store `result.userFriendlyMessage` on the intent.
  - Return JSON with `message: 'Open your draft from Mission (or add draft link to the intent), then run this again.'` and `errorCode: 'no_draft_context'`.

**Why:** Intents can be created even when the Mission row did not exist; UI can show a friendly message for "no draft context" and distinguish failure reasons.

### A3) UI stability

- **ExecutionDrawer polling with backoff:** When mission status is not `validating` or `running`, events poll interval is 8s (`EVENTS_POLL_MS_INACTIVE`); when active it remains 1.5s (`EVENTS_POLL_MS_ACTIVE`).
- **"Needs your input" vs "Failed":** `eventTypeLabel` for `failed` now prefers `payload.userFriendlyMessage` then `payload.message`, so backend-friendly messages (e.g. no_draft_context) show as user-friendly text. `needs_input` continues to show "Needs your input".
- **"Back to mission" button:** A link "Back to mission" added at the top of the drawer, linking to `/app/missions/:missionId`.
- **missionId in artifact links:** `buildStoreOutputLinks` already passes `missionId` into `buildDraftReviewQuery` for Draft Review and Preview links. No change.

**Why:** Less polling when idle; clearer failure vs needs-input; easy return to mission; artifact links keep mission context.

---

## 2) Intent Capture MVP (Workstream B)

### B1) Data models (reused / aligned)

- **StoreOffer** (Intent Capture): already exists; used for public offer page and feed.
- **DynamicQr:** reused for QR redirect (type `'offer'`, targetPath = offer page). No separate PublicCode model.
- **IntentSignal:** already exists; type aligned to **offer_view** for the public offer page view (and **qr_scan** for QR). Counts in `/api/stores/:id/intent-signals` include both `offer_view` and legacy `page_view` for the "pageViews" metric.

### B2) Public endpoints (no auth)

- **GET /p/:storeSlug/offers/:offerSlug** — Renders offer page (HTML, OpenGraph, JSON-LD Offer + LocalBusiness). Logs `IntentSignal` type **offer_view**.
- **GET /api/public/stores/:storeId/intent-feed** — Returns JSON: store + offers with `url` and `qrUrl` per offer.
- **GET /q/:code** — Resolves DynamicQr, creates ScanEvent + IntentSignal **qr_scan**, 302 redirect to offer page (or fallback).

### B3) Mission intents (Intent Capture)

All routed through **POST /api/mi/missions/:missionId/intents/:intentId/run**; orchestrator executes; MissionEvents emitted.

- **create_offer** — Creates StoreOffer + DynamicQr. Payload: `storeId` (required); optional `title`, `slug`, `description`, `priceText`. Returns `publicUrl`, `qrUrl`, `offerId`, `storeId`.
- **create_qr_for_offer** — Creates DynamicQr for an existing StoreOffer. Payload: `offerId` (required). Returns `publicUrl`, `qrUrl`, `offerId`, `storeId`.
- **publish_offer_page** — No-op (page is already live). Payload optional `storeId`. Returns message + optional `feedUrl`.
- **publish_intent_feed** — No-op (feed is already live). Payload optional `storeId`. Returns message + `feedUrl`.

Minimum runnable path: (1) **create_offer** → StoreOffer + QR; (2) public page and feed are immediately available; (3) optionally **create_qr_for_offer** to add another QR for an existing offer.

### B4) UI integration

- Mission Execution shows **"Launch your first offer"** (replacing "Create first offer"). Click creates a **create_offer** intent with `payload: { storeId }` (from mission.report.storeId or mission.artifacts.storeId).
- After run, intent result shows: **Offer page** link, **QR link**, **View signals** (counts from GET `/api/stores/:storeId/intent-signals`).
- Outcome pages (store/draft) may display these links but do not create offers or QR; creation is only via intents in Mission Execution.

---

## 3) How to test manually

### Runway Stability (A)

1. **Guardrail:** From Draft Review with `missionId` in context, trigger a gated goal (e.g. Generate tags). Confirm intent is queued and you are navigated to Mission; do not call orchestra/start from the artifact page. Optionally add a temporary direct call to `startOrchestraTask` with missionId set and confirm `assertNoDirectOrchestraWhenMissionId` throws.
2. **getOrCreateMission:** Create an intent for a mission id that does not yet exist in the Mission table (e.g. an OrchestratorTask id). POST `/api/mi/missions/:missionId/intents` with valid auth; expect 201 and intent created (Mission row created as needed).
3. **Events order:** GET `/api/mi/missions/:missionId/events`; confirm events are oldest → newest (`createdAt` ascending).
4. **No-draft-context:** Run an intent that requires draft context (e.g. generate_tags) without draftId/generationRunId in payload. Confirm failed event and response include `userFriendlyMessage` and UI shows the friendly text.
5. **ExecutionDrawer:** Open Mission, open Execution drawer. When status is completed, confirm events poll at 8s; when running, at 1.5s. Confirm "Back to mission" link goes to `/app/missions/:missionId`. Confirm failed events show user-friendly message and "Needs your input" for needs_input.

### Intent Capture (B)

1. Publish a store (Business isActive = true).
2. In Mission Execution, click **"Launch your first offer"**, then **Run** the created **create_offer** intent.
3. Visit **public offer URL** (no auth): `/p/:storeSlug/offers/:offerSlug` — page loads with title, price, description, store name, location, CTA.
4. Visit **intent feed:** `/api/public/stores/:storeId/intent-feed` — JSON with store, offers, `url`, `qrUrl`.
5. Visit **/q/:code** — 302 to offer page; confirm IntentSignal **qr_scan** and **offer_view** (from step 3) recorded; "View signals" in dashboard shows counts.
6. (Optional) Create an intent **create_qr_for_offer** with `payload: { offerId }` for an existing offer; run it; confirm new QR URL works.

---

## 4) Files changed

### Runway Stability (A)

| File | Change |
|------|--------|
| `docs/SINGLE_RUNWAY_GUARDRAILS.md` | **New.** Central "no direct orchestra from artifact pages" note + helper reference. |
| `apps/dashboard/.../lib/missionIntent.ts` | `assertNoDirectOrchestraWhenMissionId()`; grepable comment. |
| `apps/dashboard/.../features/storeDraft/review/ImproveDropdown.tsx` | Import and call `assertNoDirectOrchestraWhenMissionId(missionId)` before orchestra start path. |
| `apps/core/cardbey-core/src/routes/miIntentsRoutes.js` | POST /intents: call getOrCreateMission first; no-draft-context response and event include userFriendlyMessage and errorCode. |
| `apps/dashboard/.../app/console/ExecutionDrawer.tsx` | Events poll backoff (8s when inactive); eventTypeLabel uses userFriendlyMessage for failed; "Back to mission" link. |

### Intent Capture (B)

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/publicOfferPage.js` | IntentSignal type **offer_view** (was page_view). |
| `apps/core/cardbey-core/src/routes/stores.js` | intent-signals count: offer_view + page_view for pageViews. |
| `apps/core/cardbey-core/src/routes/miIntentsRoutes.js` | Handlers: **create_qr_for_offer**, **publish_offer_page**, **publish_intent_feed**. |
| `apps/dashboard/.../lib/missionIntent.ts` | Labels: create_offer → "Launch your first offer"; create_qr_for_offer, publish_offer_page, publish_intent_feed. |
| `apps/dashboard/.../app/console/ExecutionDrawer.tsx` | Button text "Launch your first offer". |

Existing Intent Capture files (from prior MVP) unchanged in contract: StoreOffer, IntentSignal, GET /p/..., GET /api/public/stores/:storeId/intent-feed, GET /q/:code, create_offer intent, Mission Inbox "Launch your first offer" flow and result links.
