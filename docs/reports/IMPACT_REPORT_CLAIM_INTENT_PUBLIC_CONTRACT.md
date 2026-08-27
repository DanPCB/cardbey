# IMPACT REPORT — Public claim-intent contract (dashboard CTA)

Date: 2026-08-17  
Scope: Staging `/business/:slug` “Claim My Business Space” fails with a generic error  
Status: **IMPLEMENTING** (operator screenshot is the authorization)

## (1) What could break

- Any client that treated POST `/api/public/discovery/.../claim-intent` `claimUrl` as `/activate-business/:seedId` only
- Claim flow page if GET `/api/public/discovery/claim-intents/:id` is missing after POST starts returning a claim-intent UUID
- File-backed `claim-intents.json` is still ephemeral on Render (same as today)

## (2) Why

- Staging dashboard requires `payload.claimIntentId` before navigation
- Core currently returns `{ ok: true, claimUrl: "/activate-business/:seedId" }` with no id
- The UI then always shows “Could not start claim. Please try again.” even when the POST succeeded

## (3) Impact scope

- `POST /api/public/discovery/businesses/:slug/claim-intent`
- `POST /api/public/discovery/seeds/:seedId/claim-intent`
- `GET /api/public/discovery/claim-intents/:claimIntentId` (new)
- `recordClaimButtonIntent` return value
- Does **not** publish stores, send OTP, claim ownership, or change seed status

## (4) Smallest safe patch

1. Return `claimIntentId` + `claimUrl: /claim-business/:id` + `intent` from existing POSTs
2. Add GET by id so `/claim-business/:id` can load
3. Keep recording the same JSON ClaimIntent (no Prisma, no auto-submit)
