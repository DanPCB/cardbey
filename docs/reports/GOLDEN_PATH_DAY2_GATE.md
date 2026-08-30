# Golden Path Day 2 Gate — Entry Convergence

**Gate ID:** `CARDBEY_V1_GOLDEN_PATH_DAY2_ENTRY_CONVERGED`  
**Baseline:** Day 1 `8370c2fc0` / merge `809200d9b`  
**Branch:** `golden-path-day2` (dashboard submodule)

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

## Verification

### Unit tests (dashboard)

```
✓ launchExploreCapability.test.ts — create_store navigates, no openPerformerIntent
✓ exploreIntentSearch.test.ts — create_store launchAction navigate
✓ accountMenuVariant.test.ts — create-store link matches createStoreEntryRoute
```

### Manual checklist

- [ ] Homepage `#create`: dominant **Create Your Business** button → `/app?entry=performer&onboarding=1&newStore=1&starter=create_store&source=home_create_entry`
- [ ] Public header CTA → `source=public_header`
- [ ] Global Create sheet: Create Your Business featured first
- [ ] Explore Create section → canonical entry (not intent prefill)
- [ ] My Stores / Catalog empty state CTAs → canonical entry
- [ ] Account menu Create store → full canonical params

## Verdict

**CARDBEY_V1_GOLDEN_PATH_DAY2_ENTRY_CONVERGED** — pending staging deploy smoke after PR merge.

## Related

- Impact report: `docs/reports/IMPACT_REPORT_GOLDEN_PATH_DAY2_ENTRY_CONVERGENCE.md`
- Day 1 gate: `docs/reports/GOLDEN_PATH_DAY1_GATE.md`
