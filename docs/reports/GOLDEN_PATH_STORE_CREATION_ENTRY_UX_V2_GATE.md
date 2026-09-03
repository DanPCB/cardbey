# Golden Path Gate — Store Creation Entry UX V2

**Gate ID:** `CARDBEY_V1_GOLDEN_PATH_STORE_CREATION_ENTRY_UX_V2`  
**Status:** LOCKED  
**Staging canary:** **PASS** (2026-09-03)

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

## Deploy pins

| Service | SHA / note |
|---------|------------|
| Dashboard staging | `fa8b8cc1` (PRs [#280](https://github.com/DanPCB/cardbey-marketing-dashboard/pull/280)–[#282](https://github.com/DanPCB/cardbey-marketing-dashboard/pull/282)); bundle contained `store-creation-entry-v2` |
| Monorepo staging bump | PR [#329](https://github.com/DanPCB/cardbey/pull/329) @ `a7f58366` (submodule was `489f1c9d`; canary script follow-up on dashboard) |
| Core staging | health `ok` / `env=staging` at canary time |

## Regression canary (keep small)

Script: `apps/dashboard/cardbey-marketing-dashboard/scripts/store-creation-entry-ux-v2-canary.mjs`  
Evidence: `docs/reports/evidence/store-creation-entry-ux-v2-canary/`

| Case | Result |
|------|--------|
| 412px entry | PASS |
| 1440px entry | PASS |
| Name-only `HP Services` | PASS |
| URL-only | PASS |
| Manual fallback | PASS |

Verdict: **CANARY_PASS** (7/7)

## Related

- Impact: `docs/reports/IMPACT_REPORT_STORE_CREATION_ENTRY_UX_V2.md`
- Local acceptance evidence: `docs/reports/evidence/store-creation-entry-ux-v2/`
- Day 2/3 entry + intelligence-first gates remain in force
