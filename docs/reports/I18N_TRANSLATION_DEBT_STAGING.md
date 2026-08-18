# i18n translation debt — dashboard gitlink `43140668`

**Status:** audited existing debt is pinned; CI enforces **no new debt**. Debt is **not** resolved.

| | |
|--|--|
| Current audited debt | **2553** gaps / **629** files |
| Historical/product target | **1213** (May 2026; not the current tree) |
| Delta unpaid vs target | **1340** |
| Source dashboard SHA | `431406682f5ece98d561a839e1b397433aa2ccb8` |
| Audit date | 2026-08-15 |

Parent-owned ratchet (does not change the private dashboard gitlink):

- `scripts/i18n-debt-baseline.json` — audited cap `2553`, historical target `1213`, per-file counts, SHA metadata
- `scripts/i18n-no-new-debt.mjs` — CI gate
- `scripts/i18nNoNewDebt.mjs` + `scripts/i18nNoNewDebt.test.mjs`

Rules: count `>` audited baseline → fail; new gaps in changed files vs pinned file counts → fail; equal → pass the no-new-debt gate; below → pass and report improvement. **Never auto-increase** `auditedGapCount`. Submodule `scripts/i18n-ci-baseline.json` remains the historical 1213 file and is **not** the CI cap.

Also audited at the same 2553: dashboard CI merge `9dc2e130`, RTMPS UI `80f63c16`.

The rest of this document is the 2026-08-15 diagnosis (scanner scope, false positives, locale catalog).


## Where baseline `1213` is defined

| Item | Value |
|------|--------|
| File | `apps/dashboard/cardbey-marketing-dashboard/scripts/i18n-ci-baseline.json` |
| Field | `allowedGapCount: 1213` |
| Introduced | `b056809db7360e2404550c3e12fa66b8e554183a` (2026-05-29) `feat(i18n): Sprint 2 mission console VI coverage` |
| Change | `1227` → `1213` (lowered by 14 after wiring some console strings) |
| File created | `09e0edff` (2026-05-28) `feat(i18n): auto-update agent + CI regression guard` |

The baseline JSON does **not** record a dashboard commit SHA. It is a frozen gap cap from May 2026.

## Gitlink vs baseline chronology

| Commit | Date | Role |
|--------|------|------|
| `b056809d` | 2026-05-29 | Baseline `1213` |
| `43140668` | 2026-08-15 00:00 +1000 | Staging gitlink (merge dashboard #101) |
| `80f63c16` | 2026-08-15 00:39 +1000 | RTMPS dashboard (#102) |
| `9dc2e130` | 2026-08-15 18:55 +1000 | Dashboard CI PR #103 merge |

**`43140668` postdates the baseline by ~78 days.** The gitlink is not stale relative to the baseline file; the cap was never raised while `src/` grew.

`43140668` is **not** an ancestor of `9dc2e130` or `80f63c16` (those live on `release/live-market-global-live-stg`; the gitlink is a merge of an earlier point of that line into the dashboard default branch).

## Scanner scope

Checker: `scripts/i18n-detect.mjs` → `scanHardcodedGaps()` in `scripts/i18n-lib.mjs`.

- Walks `src/` for `.ts` / `.tsx` only.
- Skips directories named `node_modules` or `__tests__`.
- Skips filenames matching `*.test|spec|stories.*` and `i18n.js`.
- Does **not** skip `src/test/` (2 gaps), generated locale JSON, or `.i18n.bak` (`.bak` is not a scan extension).
- This is a **hardcoded English-string detector**, not a locale-key completeness checker. It does not attribute gaps to `en` vs `vi`.

False positives exist (TypeScript generics matched as `jsx-text`, e.g. `| null): Promise` in `api/systemHealthClient.ts`). Count of obviously generic-ish hits ≈ 110 of 2553. The bulk sit in UI trees:

| Top `src/` dir | Gaps |
|----------------|------|
| `components` | 1156 |
| `pages` | 535 |
| `app` | 419 |
| `features` | 318 |
| `lib` | 97 |
| other | 28 |

## Locale catalog (separate from hardcoded gaps)

From `src/i18n.js` on `43140668`:

| Locale | Structural keys | Leaf strings |
|--------|-----------------|--------------|
| `en` | 4455 | 3855 |
| `vi` | 4394 | 3797 |

Leaf delta ≈ **58** Vietnamese strings behind English. That is real catalog incompleteness, **not** the 1340 hardcoded-gap overrun.

## Results on requested SHAs

| Ref | Gaps | Files | Notes |
|-----|------|-------|-------|
| `origin/staging` gitlink `43140668` | 2553 | 629 | Same populated dashboard |
| `43140668` | 2553 | 629 | |
| #103 merge `9dc2e130` | 2553 | 629 | CI-only; `src/` match |
| RTMPS `80f63c16` | 2553 | 629 | No additional scanner gaps vs gitlink |

## Are the extra 1340 gaps real?

**Mostly real scanner-detected hardcoded UI strings** accumulated after 2026-05-29, plus a minority of false positives. They are **not**:

- a wrong gitlink/baseline pairing (gitlink is newer than the cap)
- missing files the scanner is forbidden to see
- accidentally deleted `i18n.js` resources (catalog is larger than in May)

**Ratchet (2026-08-15):** pin audited 2553 in the parent repo; fail new debt; keep 1213 as the unpaid product target. Do not bulk-insert placeholder translations. TypeScript-generic false positives remain counted until the scanner is improved deterministically.

Follow-up (not this PR): pay down hardcoded UI in the top files (Mission Console telemetry, Discovery/Growth command centers, creator studio, store preview) and optionally tighten the detector so TypeScript generic syntax is not counted as JSX text.
