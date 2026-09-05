# Impact Report Addendum — Phase 1A Multi-Market Foundation (implemented)

## What changed
- `Features.multiMarketPrebuilt.*` (default OFF; aliases `FEATURE_MULTI_MARKET_DISCOVERY` / `ENABLE_MULTI_MARKET_DISCOVERY`)
- Mounted `multiMarketPrebuiltRoutes` at `/api` + alias `/api/discovery/multi-market/*`
- Extended AU/VN `marketRegistry` territories + fine SME categories
- Growth UI: `MultiMarketDiscoveryPanel` (separate from Melbourne pilot)

## What did not change
- Melbourne `REAL_LOCAL_*` suburbs/categories and `/real-local/discover`
- Auto-store / publish / owner contact (still forbidden)

## Enable (staging soak)
```
ENABLE_MULTI_MARKET_DISCOVERY_V1=true
ENABLE_AUSTRALIA_DISCOVERY_V1=true
ENABLE_VIETNAM_DISCOVERY_V1=true
```
