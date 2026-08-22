# Impact Report: Guest Ask → Create store blocked / re-Ask loop

**Date:** 2026-07-27  
**Live evidence:** Guest upload → Ask chips → Create store → MI “Create an account to continue using Cardbey Assistant” + Try again. Signed-in upload can stall on Ask after Create store.

## What could break

1. Guest rate abuse if intake POSTs are fully uncapped (mitigate: keep other guest routes capped; intake still has payload/size guards).
2. Fresh-store slim body grows slightly if we keep Ask selection + slim intentSourceContext (still no history/memory).

## Why

1. `requireUserOrGuest` returns **429** with signup copy when guest daily cap (20) is hit — same message as auth wall. Draft create-store runway burns multiple intake POSTs.
2. Client sends `freshStoreMission: true` on Ask → Create store. `normalizeFreshStoreCreationBody` **strips** `intakeV2Selection` + `intentSourceContext` (`fromAskSelection`) before `shouldSkipUploadAskForIntakeSelectionReplay` → Upload Ask again / stall.

## Impact scope

- `middleware/guestAuth.js` — exempt Performer intake v2 POST from guest daily cap.
- `lib/intake/intakePayloadGuard.js` — preserve Ask selection signals on fresh-store normalize.
- Product rule: guests may generate unpublished draft store without sign-in.

## Smallest safe patch

1. `isGuestRateLimitExemptRequest`: also true for `POST …/performer/intake/v2`.
2. `normalizeFreshStoreCreationBody`: keep slim `intakeV2Selection` + `intentSourceContext` (+ existing image).

## No-parallel-stack proof

Same intake + guest auth middleware; no new auth product or parallel create-store path.
