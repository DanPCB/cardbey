# Impact Report — Universal Library promote to main / production

**Date:** 2026-08-08  
**Scope:** Focused port of staging UL Core API + dashboard discovery flags to `main` (not full staging→main merge).

## What could break

1. **Production Core deploy** — migration `20260806200000_universal_library_population` runs; new Prisma models; `/api/universal-library` mounts.
2. **Empty live `/library`** — Core returns 200 with `[]` until bootstrap; Dashboard still hides cards if `VITE_ENABLE_UNIVERSAL_DISCOVERY_V1` missing from production build.
3. **Flag fail-closed** — `readNonProductionFlag` does **not** default ON when `NODE_ENV=production`; Render must set `ENABLE_*` explicitly.

## Why

Staging proved the chain (Core ~57 assets + Dashboard discovery flag). Production lacked both UL routes (404) and production Vite flags.

## Impact scope

- Core: UL routes/services, Prisma schemas + migration, features, server mount, bootstrap script
- Dashboard submodule: tip including PR #68 (`.env.production` discovery flags)
- Ops: prod env + one-time bootstrap (no DB copy from staging)

## Smallest safe patch

1. Cherry-pick / port UL commit onto `main` (resolved `features.js` snapshot conflict — no groundedStoreCreation/designLibrary on main).
2. Bump dashboard submodule to `f046fe41` (merge of dashboard #68).
3. After deploy: set Core `ENABLE_UNIVERSAL_LIBRARY_V1` (+ population/taxonomy/discovery/real population/originals as on staging), `PEXELS_API_KEY`; fixtures + scheduled sync **OFF**; run `staging-ul-bootstrap.mjs` against **prod** DB with bounded limit.

## Explicitly out of scope

- Full staging→main merge
- Public fixtures / scheduled provider sync
- Copying staging DB to production
