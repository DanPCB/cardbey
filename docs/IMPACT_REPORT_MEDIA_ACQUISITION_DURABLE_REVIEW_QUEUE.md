# IMPACT REPORT — Durable Media Acquisition Review Queue (V1 closure)

**Date:** 2026-09-12  
**Gate:** RICH_MEDIA_ACQUISITION_V1_FINAL_E2E_CLOSURE  
**Change:** Replace in-process `Map` review queue with disk-backed persistence so approve/reject decisions survive Core restart.

## (1) What could break
- Review list empty after Core restart (current behavior) — fixed by persistence.
- Concurrent writes corrupting queue file if multi-process — mitigated with atomic write (temp + rename); V1 assumes single Core process (matches local/dev).
- Tests assuming pure in-memory reset — `resetReviewQueueForTests` must clear file store too.

## (2) Why
E2E contract requires: add to Review → decide → **restart Core** → decision survives. In-memory Map cannot satisfy this.

## (3) Impact scope
- `services/mediaAcquisition/reviewQueue.js` only (+ tests)
- No Prisma migration, no new SSOT, no provider expansion
- File path under `apps/core/cardbey-core/data/mediaAcquisition/` (gitignored runtime)

## (4) Smallest safe patch
Persist queue JSON on each mutation; hydrate Map on load; keep existing API surface (`addToReviewQueue`, `listReviewQueue`, `resolveReviewItem`, …).

**Proceed:** Explicit V1 closure contract from owner.
