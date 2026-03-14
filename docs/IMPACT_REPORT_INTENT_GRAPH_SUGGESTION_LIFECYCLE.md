# Impact Report: Intent Graph suggestion lifecycle (accept / dismiss)

## 1. Current relevant behavior summary

- **GET /api/intent-graph/suggestions** returns `StoreActionSuggestion` rows with `status: 'active'` and `cooldownUntil` null or past. No accept/dismiss endpoints exist.
- **IntentGraphSuggestionsPanel** fetches suggestions and shows title/description only; no Accept/Dismiss actions.
- **StoreActionSuggestion.status** allowed values: `active` | `applied` | `dismissed` | `expired`. **ActionOutcome.outcome**: `applied` | `dismissed` | `expired`.
- Intent Graph is **side-channel only**; it does not touch `generateDraft()`, `transitionDraftStoreStatus`, or build_store completion.

## 2. Likely touched files

| Area | File | Change |
|------|------|--------|
| Core | `apps/core/cardbey-core/src/routes/intentGraphRoutes.js` | Add POST `/suggestions/:id/accept`, POST `/suggestions/:id/dismiss`; status transition + AuditEvent + ActionOutcome; idempotency when status already applied/dismissed |
| Dashboard | `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` | Add `postIntentGraphAccept(suggestionId)`, `postIntentGraphDismiss(suggestionId)` |
| Dashboard | `apps/dashboard/cardbey-marketing-dashboard/src/features/intentGraph/IntentGraphSuggestionsPanel.tsx` | Per-suggestion Accept / Dismiss buttons; disable during request; refetch after mutation; display status (active / applied / dismissed) |

## 3. Risks to existing workflow

- **None** to store generation or draft review flow. Changes are confined to Intent Graph API and panel. No changes to `generateDraft()`, `transitionDraftStoreStatus`, draft-store routes, or build_store.
- **Idempotency:** Repeated accept/dismiss on the same suggestion must not create duplicate ActionOutcome rows or re-run side effects; handled by checking current status and returning 200 with `already: status` when not `active`.

## 4. Invariants that must be preserved

- Intent Graph remains **not in the critical path** of store creation or draft generation.
- **No** new external APIs; no action execution (e.g. no navigation to promo creation on accept).
- **Auditability:** Every accept/dismiss writes one AuditEvent and one ActionOutcome; status transition is explicit.
- **Minimal diff:** No refactor of unrelated code; only suggestion lifecycle and panel UI.

## 5. Smallest safe implementation plan

1. **Backend (intentGraphRoutes.js)**  
   - **POST /api/intent-graph/suggestions/:id/accept**  
     - Resolve suggestion by id; 404 if not found.  
     - If `status !== 'active'`: return 200 `{ ok: true, already: status }` (idempotent).  
     - Else: in one transaction (or sequential with audit): update `StoreActionSuggestion` to `status: 'applied'`, create `ActionOutcome` with `outcome: 'applied'`, create `AuditEvent` (entityType IntentGraph / StoreActionSuggestion, action accept, fromStatus active, toStatus applied, actor from req).  
   - **POST /api/intent-graph/suggestions/:id/dismiss**  
     - Same pattern; transition to `status: 'dismissed'`, create ActionOutcome `outcome: 'dismissed'`, set `cooldownUntil: now + 7d`, write AuditEvent. Idempotent when status already dismissed (or applied).

2. **Dashboard API (api.ts)**  
   - `postIntentGraphAccept(suggestionId: string)`, `postIntentGraphDismiss(suggestionId: string)` calling the new endpoints.

3. **Panel (IntentGraphSuggestionsPanel.tsx)**  
   - For each suggestion with `status === 'active'`: show Accept and Dismiss buttons.  
   - On click: call accept or dismiss, disable button / set loading per suggestion, on success refetch suggestions and call onRefresh.  
   - Display current status (e.g. badge or text: Active / Accepted / Dismissed).  
   - If we only show active suggestions (GET already filters), accepted/dismissed ones disappear from list; optional: show a short “Accepted”/“Dismissed” state before refetch so UI doesn’t flash. For minimal scope, refetch is enough; status in list can still be shown if we later include non-active in response for “recent” section.

4. **Deferred**  
   - Action execution (e.g. navigating to create promo on accept).  
   - Changes to generateDraft, transitionDraftStoreStatus, or build_store flow.

---

## Post-implementation summary

### Modified files

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/intentGraphRoutes.js` | Added POST `/suggestions/:id/accept`, POST `/suggestions/:id/dismiss` with status transition, ActionOutcome, AuditEvent, idempotency. |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` | Added `postIntentGraphAccept(suggestionId)`, `postIntentGraphDismiss(suggestionId)`. |
| `apps/dashboard/cardbey-marketing-dashboard/src/features/intentGraph/IntentGraphSuggestionsPanel.tsx` | Accept/Dismiss buttons per suggestion; `mutatingId` to disable during request; refetch after mutation; status label (Active / status). |
| `docs/IMPACT_REPORT_INTENT_GRAPH_SUGGESTION_LIFECYCLE.md` | This impact report and plan. |

### New API endpoints

- **POST /api/intent-graph/suggestions/:id/accept**  
  Transitions `StoreActionSuggestion.status` from `active` → `applied`. Creates one `ActionOutcome` (outcome `applied`) and one `AuditEvent` (action `status_transition`, reason `INTENT_GRAPH_ACCEPT`). Idempotent: if status is not `active`, returns `200 { ok: true, already: status }` and does not create duplicate outcomes or audit rows.

- **POST /api/intent-graph/suggestions/:id/dismiss**  
  Transitions `StoreActionSuggestion.status` from `active` → `dismissed` and sets `cooldownUntil` to now + 7 days. Creates one `ActionOutcome` (outcome `dismissed`) and one `AuditEvent` (reason `INTENT_GRAPH_DISMISS`). Idempotent: same as accept.

### Status transition rules

| From   | To        | Trigger   | Side effects |
|--------|-----------|-----------|--------------|
| active | applied   | POST accept | ActionOutcome(applied), AuditEvent(INTENT_GRAPH_ACCEPT) |
| active | dismissed | POST dismiss | ActionOutcome(dismissed), AuditEvent(INTENT_GRAPH_DISMISS), cooldownUntil = now + 7d |
| applied / dismissed | (unchanged) | POST accept or dismiss | No DB writes; return 200 { ok: true, already } |

### Idempotency handling

- Before updating, the handler loads the suggestion and checks `status === 'active'`.
- If `status !== 'active'`, it returns immediately with `200 { ok: true, already: suggestion.status }` and does **not** run the transaction (no second ActionOutcome, no second AuditEvent, no status update).
- Repeated accept or dismiss on the same suggestion therefore never creates duplicate outcomes or audit events.

### Manual verification steps

1. **Accept**  
   - Open draft review; ensure Intent Graph panel has at least one suggestion (Build if needed).  
   - Click **Accept** on one suggestion.  
   - Expect: button(s) disabled briefly, then list refetches and that suggestion disappears (GET /suggestions returns only active).  
   - In DB: `StoreActionSuggestion` for that id has `status = 'applied'`; one `ActionOutcome` with `outcome = 'applied'`; one `AuditEvent` with `reason = 'INTENT_GRAPH_ACCEPT'`.

2. **Dismiss**  
   - Click **Dismiss** on another suggestion.  
   - Expect: same UX; suggestion disappears after refetch.  
   - In DB: `status = 'dismissed'`, `cooldownUntil` set; one `ActionOutcome` (dismissed); one `AuditEvent` (INTENT_GRAPH_DISMISS).

3. **Idempotency**  
   - Call POST accept (or dismiss) again with the same suggestion id (e.g. via curl or devtools).  
   - Expect: 200 `{ ok: true, already: 'applied' }` (or `'dismissed'`) and no new ActionOutcome or AuditEvent rows.

4. **Store generation unchanged**  
   - Run through create draft → generate → ready flow; confirm no regression. Intent Graph is not in that path.

### Intentionally deferred

- **Action execution:** Accept does not navigate to promo creation or run any business flow; it only updates status and writes audit/outcome.
- **generateDraft / transitionDraftStoreStatus / build_store:** Not modified.
- **External APIs:** None added.
