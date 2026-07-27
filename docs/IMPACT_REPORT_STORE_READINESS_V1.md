# Impact Report: PIL Seller Assistant — Store Readiness V1

Canonical detail: `apps/core/cardbey-core/docs/IMPACT_REPORT_STORE_READINESS_V1.md`  
Ops guide: `apps/core/cardbey-core/docs/STORE_READINESS_V1.md`

## Summary

Seller-only store readiness (deterministic checks + owner API + Studio panel + separate seller PIL context). Consumer PIL unchanged when flags are off.

## Flags

| Layer | Flags (default off) |
|-------|---------------------|
| Core | `ENABLE_STORE_READINESS_V1`, `ENABLE_PIL_SELLER_ASSISTANT_V1` |
| Dashboard | `VITE_ENABLE_STORE_READINESS_V1`, `VITE_ENABLE_PIL_SELLER_ASSISTANT_V1` |

## Endpoints

- `GET /api/stores/:storeId/readiness`
- `POST /api/stores/:storeId/readiness/refresh`
- Alias: `/api/business-studio/stores/:storeId/readiness`

## No-parallel-stack proof

Does not replace Mission 1000 readiness or `src/lib/storeReadiness.ts` publish percent. New path is `storeReadiness` (core) / `storeReadinessV1` (dashboard) + isolated `pil/seller` store.
