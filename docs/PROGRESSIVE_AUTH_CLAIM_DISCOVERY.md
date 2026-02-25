# Step 0 — Discovery: Progressive Auth Gate + Auto-Claim

## A) Backend — Guest identity and claim

### Guest identity
- **Cookie:** `guestSessionId` (UUID). Set by middleware `guestSession.js` if missing; 7-day maxAge, httpOnly, sameSite: Lax.
- **Header:** `X-Guest-Session` can supply the same ID (e.g. for non-cookie clients).
- **Middleware:** `guestSessionId` in `apps/core/cardbey-core/src/middleware/guestSession.js` sets `req.guestSessionId`.
- No guest JWT role or `tenantId 'guest_*'` used for draft ownership; guest scope is purely `guestSessionId` (cookie/header).

### Models
- **DraftStore** (Prisma): `ownerUserId String?`, `guestSessionId String?`. Claim sets `ownerUserId = req.userId` for drafts matching `guestSessionId` and `ownerUserId: null`, `status: { not: 'committed' }`.
- **Business (Store):** `userId` (owner). Committed store is created at publish and linked to the user who publishes; no separate "guest store" claim for Business.

### Existing claim
- **POST /api/draft-store/claim** (core): `apps/core/cardbey-core/src/routes/draftStore.js`
  - Middleware: `guestSessionId`, `requireAuth`.
  - Body: `{ draftId?: string }`. If `draftId` omitted, claims all drafts in guest scope.
  - Returns: `{ ok: true, claimedCount, draftIds }`.
  - Idempotent: if none match, returns `ok` with empty `draftIds`.

**Conclusion:** No backend changes required. Use existing **POST /api/draft-store/claim** with optional `draftId`. No `/api/stores/claim` needed; ownership of committed store follows from claiming the draft then publishing.

---

## B) Frontend — Auth modal and gated actions

### Auth modal / gatekeeper
- **Store:** `useAuthPromptStore` in `src/stores/authPromptStore.ts`: `open({ reason?, returnTo? })`, `close`.
- **Modal:** `AuthRequiredModal.tsx`: title "Sign in to continue", body about edit/publish, Login + Sign up; navigates to `/login?returnTo=...` or `/signup?returnTo=...`.
- **Gatekeeper:** `useGatekeeper()` in `src/features/auth/useGatekeeper.ts`: `gate(action, requirePremium)`, `openAuthModal()` (sets returnTo and opens auth prompt).

### runWithAuth (StoreDraftReview)
- Wraps actions with `gatekeeper.gate()`; on failure opens auth modal and rejects with `AUTH_REQUIRED`.
- Catches 401 / AUTH_REQUIRED from inner `fn()`, opens modal, rejects with code.
- Publish flow: `handlePublish` → `runWithAuth(actualPublishFn, options)`. On reject, `.catch` sets `cardbey.publishAfterAuth`; effect on `user` runs claim then `handlePublishRef.current()`.

### "Next step" actions to gate (minimum)
1. **Publish to live** — `StoreDraftReview.tsx` `handlePublish` (ownership modal + claim-before-resume implemented).
2. **Create QR Promo** — post-publish dialog / CTA; gate with ownership, optional `required: false`.
3. **AI generation / auto-fill / repair** — paid_ai flows already require auth/credits; can add claim-before-resume.

---

## Summary for implementation

| Item | Value |
|------|--------|
| Guest identity | Cookie `guestSessionId` (and optional header `X-Guest-Session`) |
| Claim endpoint | **POST /api/draft-store/claim** (existing), body `{ draftId?: string }` |
| Draft fields for claim | `DraftStore.guestSessionId`, `DraftStore.ownerUserId` |
| Frontend gate | ownership variant modal + runWithOwnershipGate + sessionStorage pending then claim then run |

### Endpoint spec: POST /api/draft-store/claim (existing)

- **Method:** POST
- **Path:** `/api/draft-store/claim`
- **Auth:** Required (Bearer).
- **Guest scope:** Cookie `guestSessionId` or header `X-Guest-Session`.
- **Body:** `{ draftId?: string }` — optional; if omitted, claims all drafts in guest scope with `ownerUserId: null` and `status !== 'committed'`.
- **Response:** `{ ok: true, claimedCount: number, draftIds: string[] }`. Idempotent: if none match, returns `ok: true`, `claimedCount: 0`, `draftIds: []`.
- **Side effect:** Sets `DraftStore.ownerUserId = req.userId` for matched rows.
