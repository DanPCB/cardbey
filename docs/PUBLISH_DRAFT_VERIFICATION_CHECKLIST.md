# Publish draft – regression verification

After the fix for P2002 on `Business.userId` (reuse existing business, idempotent publish):

## 1. User already has Business → publish new draft → success

- Create a user account and publish a first store (draft → Publish). Success, one Business created.
- Create a second draft (e.g. new quick start or new generation).
- Call POST /api/store/publish with storeId: "temp" and the new draft’s generationRunId (or omit for “best” draft).
- **Expected:** 200, new storeId may be the same business id (reused); catalog is from the new draft. No 409, no P2002.

## 2. Publish same draft twice → second call succeeds, same store

- Publish a draft (storeId: "temp", generationRunId: X). Note `publishedStoreId` in response.
- Call POST /api/store/publish again with the same storeId and generationRunId.
- **Expected:** 200, same `publishedStoreId` and storefrontUrl. No duplicate Business, no duplicate Store. AuditEvent/transitions: first call creates store_published; second call does not create a second business.

## 3. Guest draft → sign in → publish works

- As guest, create a draft (e.g. quick start). Sign in or register.
- Claim or open the draft, then POST /api/store/publish with storeId: "temp" and generationRunId.
- **Expected:** 200, store created and linked to the signed-in user. No 401 after sign-in.

## 4. AuditEvent / kernel transitions

- After a successful publish (first time for that draft), check that:
  - DraftStore.status is "committed", committedStoreId and committedUserId set.
  - ActivityEvent (or equivalent) has type store_published with correct draftId/storeId.
- Idempotent second publish: transition is not run again (early return); no duplicate events.

## 5. 409 only for real conflicts

- P2002 on Business.userId must no longer occur (reuse business).
- If P2002 occurs on another unique field (e.g. store slug), API returns 409 with a clear message (e.g. “A store with this identifier already exists”).
- 403 for “draft belongs to another user” or “not owner”; 409 for unique constraint on slug/other, not for “user already has a business”.
