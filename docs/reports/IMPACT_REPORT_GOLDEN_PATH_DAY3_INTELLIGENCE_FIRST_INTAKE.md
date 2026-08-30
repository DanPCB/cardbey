# Impact Report — Golden Path Day 3 Intelligence-First Intake

**Gate target:** `CARDBEY_V1_GOLDEN_PATH_DAY3_INTELLIGENCE_FIRST_INTAKE_READY`  
**Baseline:** `43c9b1d74` (Day 2 entry converged)  
**Scope:** Core intake only — `storeCreationDraft`, intake validation, NL parsing, website hints.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Checkpoint starts with wrong business identity | URL domain used as provisional name | Research pipeline remains authoritative; owner review thresholds unchanged |
| Premature dispatch without location | Name-only relaxation | Only when research/name-resolution path is eligible; hard blockers remain for insufficient input |
| Form validation asymmetry | Intelligence-first skips inferable field errors | `_autoSubmit` still blocks on `insufficient_input` and ambiguous entity |
| Day 1 research fidelity regression | Relaxing missing-field gates | No changes to `businessResearchAgent`, Mission 001 flags, or offering reconstruction |
| Day 2 entry regression | Touching draft builder only | No dashboard/routing changes |

## Impact scope

- **In scope:** `storeCreationIntakePolicy.js`, `storeCreationDraft.js`, `storeCreationDraftAssetBridge.js`, `intakeErrorTypes.js`, `intakeSystemShortcuts.js`
- **Out of scope:** Dashboard CTAs, post-create redirect, Orchestra, `/create`, Mission 001 architecture

## Smallest safe patch

1. Add `assessStoreCreationIntake()` — inferable vs hard-blocker classification
2. Extend NL parsing (URL, standalone name, description-first patterns)
3. Sync website hints (domain → name) before missing-field assessment
4. Relax `computeMissingStoreCreationFields` + `validateStoreCreationFields` via assessment
5. Single-clarification copy for hard blockers only
6. Focused unit tests; no unrelated refactors

**Proceed:** User provided Day 3 specification with explicit scope lock.
