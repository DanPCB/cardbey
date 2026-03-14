# Mission Launcher Guest Auth Boundary — Implementation Summary

## Goal

Adjust auth so **guest users** may create and inspect a draft store, but **any follow-up mission execution** (Launch your first offer, Fix on opportunities, Run intent, MI Assistant queue actions) requires account registration/sign-in. Single clean auth boundary for the Single Runway store creation path.

---

## 1. Files changed

| File | Change |
|------|--------|
| `apps/dashboard/.../src/lib/missionGuestAuth.ts` | **New.** Central guest capability policy, `requiresAuthForMissionIntent`, `buildMissionReturnTo`, `lineageFromMission`, UI copy constants. |
| `apps/dashboard/.../src/app/console/ExecutionDrawer.tsx` | Guest detection, `openMissionAuthGate`, gate CreateFirstOffer / opportunity Fix / Run intent; pass `onBeforeAction` to CreateFirstOfferButton. |
| `apps/core/cardbey-core/src/routes/stores.js` | Reject guest on `POST /:id/opportunities/:opportunityId/accept` with 403 and clear message. |

**Existing (unchanged):**

- `StoreDraftReview` already gates ImproveDropdown / MI Assistant with `onBeforeMIAction` (guest → `gatekeeper.openAuthModal()`). No change.

---

## 2. Central guest capability / auth policy

**Module:** `src/lib/missionGuestAuth.ts`

- **`requiresAuthForMissionIntent(intentType)`** — Returns true for all post-draft intent types (create_offer, create_qr_for_offer, publish_intent_feed, improve_promotion_copy, launch_followup_offer, prepare_to_publish, improve_store_hero, mi_assistant_message, generate_tags, rewrite_descriptions, fill_missing_images, repair_product_images, generate_store_hero, fix_catalog, etc.).
- **`canExecuteMissionActionAsGuest(intentType)`** — Inverse of above; use for “can run as guest” checks.
- **`buildMissionReturnTo(lineage, basePath?)`** — Builds returnTo URL with missionId and optional lineage params (draftId, generationRunId, jobId, storeId, committedStoreId) so after sign-in user returns to the same mission execution context.
- **`lineageFromMission(mission)`** — Derives lineage from mission + artifacts for use in returnTo.
- **Copy constants:** `MISSION_AUTH_GATE_MESSAGE`, `MISSION_AUTH_GATE_REASON`, `MISSION_AUTH_GUEST_CAPABILITY_MESSAGE`.

Logic is not duplicated; all mission guest gating uses this module.

---

## 3. Surfaces gated

| Surface | Behavior for guest |
|---------|---------------------|
| **Mission Console — “Launch your first offer”** | Before `createMissionIntent`, if guest → open auth modal with returnTo (lineage), no API call. |
| **Mission Console — Growth opportunities “Fix”** | Before `acceptOpportunity`, if guest and intent type requires auth → open auth modal, no API call. |
| **Mission Console — Mission Inbox “Run”** | Before `runMissionIntent`, if guest → open auth modal, no run. |
| **Draft Review — ImproveDropdown / MI Assistant** | Already gated in StoreDraftReview via `onBeforeMIAction` (guest → `openAuthModal()`). |

“Open Draft Review” and “Open Store Preview” remain **allowed** for guests (no gate).

---

## 4. Copy / messages

- **Modal / reason:** `MISSION_AUTH_GATE_REASON` = “Create an account to continue running business actions.”
- **Primary message:** `MISSION_AUTH_GATE_MESSAGE` = “Your draft is ready. Sign in to launch offers, promotions, and growth actions.”
- **Optional secondary:** `MISSION_AUTH_GUEST_CAPABILITY_MESSAGE` = “Guest mode lets you create and review a draft. Advanced business actions require an account.”

Auth prompt store is opened with `reason: MISSION_AUTH_GATE_REASON` and `required: true` so the modal shows the gate reason and does not offer “Continue as guest” for these actions.

---

## 5. Root cause of FK / auth path (guest follow-up actions)

- **Observed:** Guest “Launch your first offer” (or accept opportunity) can reach `getOrCreateMission(missionId, req.user, …)` and then `prisma.mission.create` or `prisma.intentRequest.create` and hit FK or auth issues.
- **Cause:** For guest, `requireAuth` sets `req.user = { id: userId, role: 'guest' }` from the JWT **without** a DB user row. That `userId` may not exist in `User`. So:
  - `getOrCreateMission` uses `user.id` for `createdByUserId` and `getTenantId(user)` for `tenantId`; if `user.id` is not in `User`, `Mission` create can violate FK.
  - Similarly, `IntentRequest` create uses `req.user.id`; if that id is not in `User`, FK can fail.
- **Fix (applied):**
  - **Frontend:** Block guest before any post-draft action (CreateFirstOffer, opportunity Fix, Run intent) and show sign-in/sign-up with returnTo.
  - **Backend:** At the start of `POST /api/stores/:id/opportunities/:opportunityId/accept`, if `req.user?.role === 'guest'`, return **403** with a clear `account_required` message and do not create Mission or IntentRequest. No partial create, no broken state.

---

## 6. Backend safe fallback

If a guest still hits a restricted endpoint:

- **Response:** 403, `ok: false`, `error: 'account_required'`, `message`: “Create an account to continue running business actions. Sign in or sign up to launch offers, publish your feed, and use growth actions.”
- **Behavior:** No Mission or IntentRequest creation; no partial or broken state.

---

## 7. Lineage through auth

When the auth gate is shown from Mission Console:

- **returnTo** is built with `buildMissionReturnTo(lineageFromMission(mission))`, which includes current path and query params and adds lineage (missionId, draftId, generationRunId, jobId, storeId, committedStoreId) when available.
- After sign-in/sign-up, the user is sent to that returnTo URL so they land on the same mission execution screen and can continue from the same mission/draft lineage.

---

## 8. Manual verification checklist

- **Flow A — Guest store creation:** Start as guest → create store mission → draft created → Open Draft Review works → no auth gate.
- **Flow B — Guest post-draft from Mission Console:** As guest, open mission with completed draft → click “Launch your first offer” → auth gate appears; no FK error or mission create attempt.
- **Flow C — Guest opportunity Fix:** As guest, click a Growth Opportunity “Fix” → auth gate; no queue/execute beyond boundary.
- **Flow D — Guest MI Assistant:** As guest, trigger MI Assistant quick fix that would queue a mission intent → auth gate (existing StoreDraftReview gate); after sign-in, return to same context.
- **Flow E — Post-auth continuation:** Guest triggers restricted action → sign in/sign up → return to same mission/draft lineage and continue as registered user.
- **Flow F — Open Draft Review not gated:** Guest can click “Open Draft Review” without being asked to sign in.

---

## 9. Follow-up (if needed)

- If another backend route creates intents (e.g. `POST /api/mi/missions/:id/intents`), add the same guest check at the top: `if (req.user?.role === 'guest') return 403` with the same message.
- Optionally surface `MISSION_AUTH_GATE_MESSAGE` or `MISSION_AUTH_GUEST_CAPABILITY_MESSAGE` in the auth modal body when opened from mission execution (if the modal component supports dynamic body copy).
