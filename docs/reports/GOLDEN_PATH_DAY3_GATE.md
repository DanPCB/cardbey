# Golden Path Day 3 Gate — Intelligence-First Intake

**Gate ID:** `CARDBEY_V1_GOLDEN_PATH_DAY3_INTELLIGENCE_FIRST_INTAKE_READY`  
**Baseline:** `43c9b1d74` (Day 2 entry converged)

## Blocking conditions found (before)

| Stage | Blocker |
|-------|---------|
| `computeMissingStoreCreationFields` | Required `location` + non-`Other` `category` even when URL/name present |
| NL draft builder | Did not extract bare domains / standalone business names |
| Website enrich | Only on upload path, not plain chat intake |
| `validateStoreCreationFields` | `_autoSubmit` 400 on missing location/category before research |

## Implementation decisions

1. **`storeCreationIntakePolicy.js`** — classifies input mode; separates inferable vs hard-blocker gaps; telemetry payload
2. **`computeMissingStoreCreationFields`** — delegates to assessment (intelligence-first default)
3. **`parseNaturalLanguageStoreCreation`** — URL-only, standalone name, description-first patterns
4. **`applySyncWebsiteHintsToDraft`** — domain → provisional name before assessment
5. **`validateStoreCreationFields`** — intelligence-first path; single-field errors only for hard blockers
6. **No changes** to `businessResearchAgent`, Mission 001 flags, dashboard entry routes

## Files changed

- `apps/core/cardbey-core/src/lib/intake/storeCreationIntakePolicy.js` (new)
- `apps/core/cardbey-core/src/lib/intake/storeCreationDraft.js`
- `apps/core/cardbey-core/src/lib/intake/storeCreationDraftAssetBridge.js`
- `apps/core/cardbey-core/src/lib/intake/intakeErrorTypes.js`
- `apps/core/cardbey-core/src/lib/intake/intakeSystemShortcuts.js`
- `apps/core/cardbey-core/src/lib/intent/storeCreateFastPath.js` (hotfix: store_setup identity fast path)
- `apps/core/cardbey-core/src/routes/performerIntakeV2Routes.js` (hotfix: intent engine + ambiguous chat bypass)
- `apps/core/cardbey-core/src/lib/intake/__tests__/storeCreationIntakePolicy.test.js` (new)
- `apps/core/cardbey-core/src/lib/intake/__tests__/storeCreationDraft.test.js`
- `scripts/golden-path-day3-staging-verify.mjs` (new)

## Before / after intake behavior

| Input | Before | After |
|-------|--------|-------|
| `modernsecuritydoors.com.au` | Missing category + location | URL extracted; name from domain; research-eligible; no category/location block |
| `Market Lane Coffee` | Missing location + category | Name-only research path; no pre-research form |
| Description-only | Often insufficient / all fields missing | Provisional name + inferred category/location from text |
| `Help me start something.` | Generic multi-field prompt | Single insufficient-input clarification |
| `create a store and a mini website` | (Day 1) clarify runway | Unchanged — Day 1 test still passes |

## Tests (local)

```
✓ storeCreationIntakePolicy.test.js (9)
✓ storeCreationDraft.test.js (16)
✓ intakeShortcutContext.test.js (6) — Day 1 ambiguous runway preserved
```

## Live staging cases

**Deploy SHA:** `2f11269b1` (staging merge of PRs #281–#284)  
**Verified:** 2026-08-30 via `node scripts/golden-path-day3-staging-verify.mjs`

| Case | Status |
|------|--------|
| A URL-only | **PASS** |
| B Name-only | **PASS** (hotfix: ambiguous chat shortcircuit bypass + store_setup fast path) |
| C Description-only | **PASS** |
| D Handyman Melbourne | **PASS** |
| E Insufficient input | **PASS** |
| F Ambiguous entity (ABC Plumbing) | NOT IN SCRIPT — requires live entity resolution |

```bash
node scripts/golden-path-day3-staging-verify.mjs
# VERDICT: CARDBEY_V1_GOLDEN_PATH_DAY3_INTELLIGENCE_FIRST_INTAKE_READY (staging smoke PASS)
```

## Regression checks

| Check | Status |
|-------|--------|
| Day 1 ambiguous create-runway (`intakeShortcutContext`) | PASS (local) |
| Day 2 entry convergence (dashboard) | PASS (unchanged) |
| Mission 001 research pipeline | Not modified |

## Known limitations

- Async website metadata enrich (`resolveWebsiteMetadataForStoreDraft`) not yet wired on all NL intake response paths — sync domain hints only
- Ambiguous entity clarification at intake requires async `resolveBusinessEntity` hook (deferred to live proof / follow-up)
- `pil_create_space` / homepage `home_create_entry` unchanged (Day 2 scope)

## Verdict

**CARDBEY_V1_GOLDEN_PATH_DAY3_INTELLIGENCE_FIRST_INTAKE_READY** — implementation, local tests, and live staging smoke **PASS** (cases A–E).

**DAY 4 READY:** YES (post-create redirect / result surfaces may proceed on separate branch).

## Related

- `docs/reports/IMPACT_REPORT_GOLDEN_PATH_DAY3_INTELLIGENCE_FIRST_INTAKE.md`
- Day 2 gate: `docs/reports/GOLDEN_PATH_DAY2_GATE.md`
