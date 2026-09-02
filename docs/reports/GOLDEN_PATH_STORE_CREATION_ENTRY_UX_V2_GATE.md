# Golden Path Gate — Store Creation Entry UX V2

**Gate ID:** `CARDBEY_V1_GOLDEN_PATH_STORE_CREATION_ENTRY_UX_V2`  
**Status:** LOCKED (implementation accepted; staging canary required after deploy)  
**Contract (frozen):**

```
Create Store → one clue → understand/research → ask only for genuinely missing information → create → reveal
```

## Locked product rules

1. Default first step is **not** a registration form.
2. Accept **one useful clue**: business name **or** website URL **or** short description **or** card/image via existing attach path.
3. Do **not** show the 9-category grid or require location on the default first step.
4. Progressive clarification asks **only** for the next genuinely missing fact.
5. “Enter details manually” remains fallback UX — not the Golden Path.
6. One engine: Intake V2 + store creation draft + research/create pipeline. No parallel creators.
7. Further work improves **intelligence/reliability behind** this entry — do **not** gradually add fields back onto the first step.

## Deploy pins (fill after staging canary)

| Service | SHA |
|---------|-----|
| Dashboard (`cardbey-marketing-dashboard` staging) | `489f1c9d` (PRs [#280](https://github.com/DanPCB/cardbey-marketing-dashboard/pull/280), [#281](https://github.com/DanPCB/cardbey-marketing-dashboard/pull/281)) |
| Monorepo submodule bump | `chore/bump-dashboard-store-creation-entry-v2` → staging |
| Core staging | _(record at canary)_ |

## Regression canary (keep small)

Script: `apps/dashboard/cardbey-marketing-dashboard/scripts/store-creation-entry-ux-v2-canary.mjs`

| Case | Expect |
|------|--------|
| 412px entry | AI-first card; no category grid; no default location |
| 1440px entry | Compact AI-first entry |
| Name-only `HP Services` | Intelligence/create path (not full manual form) |
| URL-only | Intelligence path without pre-research category/location form |
| Manual fallback | Detailed fields available |

Full matrix (45 checks) is optional; do not require it for every deploy.

## Related

- Impact: `docs/reports/IMPACT_REPORT_STORE_CREATION_ENTRY_UX_V2.md`
- Evidence: `docs/reports/evidence/store-creation-entry-ux-v2/`
- Day 2/3 entry + intelligence-first gates remain in force
