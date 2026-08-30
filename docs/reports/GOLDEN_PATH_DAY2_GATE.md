# Golden Path Day 2 Gate — Entry Convergence

**Gate ID:** `CARDBEY_V1_GOLDEN_PATH_DAY2_ENTRY_CONVERGED`  
**Baseline:** Day 1 `8370c2fc0` / merge `809200d9b`  
**Deploy:** Dashboard `c467e95a` (PR #253 → `be014c49`) · Monorepo `7da39187e` (PR #280)

## Scope delivered

Single dominant store-creation CTA — **Create Your Business** — routes through `createStoreEntryRoute({ source })` across:

| Surface | Change |
|---------|--------|
| `createNewBusinessHref` / `BUSINESS_SETUP_HREF` | Delegate to canonical params (`entry`, `onboarding`, `newStore`, `starter`, `source`) |
| Sidebar `create-store` nav | Uses `createStoreEntryRoute()` |
| Global Create launcher | `create_store` featured + first; routes with `source=global_create_launcher` |
| Explore `launcher_create` + `create_store` | `launchAction: navigate` → canonical href |
| `HomeCreateEntryCard` | Primary CTA → Performer entry; Quick Start demoted behind toggle |
| `PublicHeader` | Visible Create Your Business link (desktop + mobile) |
| `MyStoresPage` / `CatalogPage` empty states | Canonical entry |
| PIL `create_space` | `actionCatalog` + `usePILAssistantHost` → canonical entry |

## Out of scope (unchanged)

- Core intake / `computeMissingStoreCreationFields`
- Post-create redirect
- Orchestra runtime
- Frontscreen AIDock generic handoff (`/app?intent=…` retained for freeform prompts)
- `/create`, `/for-sellers`, `/space/create-business` routes (demoted, not removed)

## Live staging evidence (2026-08-30)

### Deploy pins

| Service | SHA / note |
|---------|------------|
| `cardbey-core-staging` | `809200d9b` — Day 1 baseline (expected; no Day 2 core changes) |
| `cardbey-dashboard-staging` | Bundle `index.CSIeB1Qy.js` — Day 2 source tags present |

### Automated smoke (`scripts/golden-path-day2-staging-verify.mjs`)

```
[PASS] Core staging on Day 1 baseline — sha=809200d
[PASS] Dashboard homepage reachable
[PASS] Canonical create-store query params in bundle
[PASS] Source tags: public_header, global_create_launcher, explore_launcher_create,
       explore_create_store, create_new_business, role_intent_business,
       my_stores_empty, catalog_empty, pil_assistant_host
[PASS] Bundle string: Create Your Business
[PASS] /create route retained (demoted)
[PASS] Explore create_store → navigate + canonical /app entry
```

**Notes:**
- Live `/` mounts the Global Front feed (`CardbeyFrontscreenTopNavPreview`), not `Homepage.tsx` — so `home_create_entry` is not in the main bundle; entry on `/` is covered by **PublicHeader** (`public_header`) and **Global Create launcher** (`global_create_launcher`).
- `pil_create_space` (actionCatalog) not in main bundle; active PIL handoff uses `pil_assistant_host`.

### Checklist (staging)

- [x] Public header CTA → `source=public_header` (bundle)
- [x] Global Create launcher → `source=global_create_launcher` (bundle)
- [x] Explore create_store → `source=explore_create_store` + navigate (bundle)
- [x] Account / nav helpers → `create_new_business`, `role_intent_business` (bundle)
- [x] My Stores / Catalog empty → `my_stores_empty`, `catalog_empty` (bundle)
- [x] Core unchanged on Day 1 `809200d`
- [x] `/create` retained (demoted)

## Verdict

**CARDBEY_V1_GOLDEN_PATH_DAY2_ENTRY_CONVERGED**

Day 2 entry convergence is live on staging. Day 3 (intake relaxation / `computeMissingStoreCreationFields`) remains **not started**.

## Related

- Impact report: `docs/reports/IMPACT_REPORT_GOLDEN_PATH_DAY2_ENTRY_CONVERGENCE.md`
- Day 1 gate: `docs/reports/GOLDEN_PATH_DAY1_GATE.md`
