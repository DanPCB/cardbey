# Store Readiness V1 + Phase 2 Guided Intelligence + Phase 3 Drafts

## Feature flags

### Core

```bash
ENABLE_STORE_READINESS_V1=1
ENABLE_PIL_SELLER_ASSISTANT_V1=1
ENABLE_STORE_READINESS_DRAFTS_V1=1   # Phase 3
STORE_READINESS_DIAGNOSTICS=1       # optional force diagnostics outside NODE_ENV=development
```

### Dashboard

```bash
VITE_ENABLE_STORE_READINESS_V1=true
VITE_ENABLE_PIL_SELLER_ASSISTANT_V1=true
VITE_ENABLE_STORE_READINESS_DRAFTS_V1=true
```

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/stores/:storeId/readiness` | Snapshot (+ `?diagnostics=1`) |
| POST | `/api/stores/:storeId/readiness/refresh` | Re-aggregate |
| GET | `/api/stores/:storeId/readiness/explain` | `?q=` or `?findingCode=` |
| GET/POST | `/api/stores/:storeId/readiness/drafts` | List / create (flag) |
| POST | `.../drafts/:id/regenerate\|approve\|reject\|apply` | Governed lifecycle |

Alias: `/api/business-studio/stores/:storeId/readiness/*`

## Phase 2

- Structured `evidence` object + `reason` / `recommendation`
- Deep-link labels (`Open Hero Images`, `Open Product #12`, …) + catalog `filter=incomplete`
- Impact: `estimatedImpactPercent` + `estimatedEffortMinutes`
- Vertical rules: restaurant / retail / service / creator
- Seller answers grounded in `StoreReadinessSnapshot` only
- Dev diagnostics on snapshot when development

## Phase 3

- `ReadinessDraft` proposals (in-memory store)
- Generate → Preview → Approve → Apply existing Prisma field updates → Refresh snapshot
- Never auto-publish; never apply without owner approval
- Consumer PIL remains isolated

## Pipeline

Business → Aggregator → Snapshot → Prioritizer → Panel → Seller PIL → (optional) Draft Generator → Owner Approve → Existing Mutation → Refresh
