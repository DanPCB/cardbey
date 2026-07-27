# Phase 3: Decision Loop Authority

**Status:** Implemented (feature-flagged); unit + golden tests green (34 tests)
**Flag:** `INTAKE_DECISION_LOOP_AUTHORITY=true`

## Behavior

When the flag is **off** (default): legacy classification + Phase 2 shadow rank (unchanged).

When the flag is **on**:

1. Legacy pipeline still runs (IntentReasoner, upload overrides, etc.)
2. Before validation, `decideTurn()` runs with unified belief + advisors
3. **Final `classification` is replaced** by `turnResultToClassification()`
4. Divergence vs legacy logged as `[intake/decision-loop] replaced legacy classification`

Skipped when: `forcedTool`, draft form submit, manual mode, `freshStoreMission`.

## decideTurn outcomes

| nextStep | Intake mapping |
|----------|----------------|
| `execute` | tool + registry executionPath |
| `present_options` | clarify + options (upload ask) |
| `clarify` | clarify |
| `checkpoint` | tool + `_autoSubmit: false` + governance pending |
| `continue_workflow` | resume_active_mission |
| `guide_auth` | clarify (guest campaign) |

## Governance

Uses `intakeToolRegistry.approvalRequired` + hardcoded never-auto-submit campaign tools.

## Env

```
INTAKE_DECISION_LOOP_AUTHORITY=false   # default
INTAKE_DECISION_LOOP_LOG=true
INTAKE_DECISION_T_LOW=0.55
INTAKE_DECISION_T_MARGIN=0.15
```

## Rollout

1. Staging: flag on, monitor `[intake/decision-loop/early]` and `[intake/decision-loop]` agree rate
2. Golden conversations pass with flag on
3. Real UI upload → create store flow verified
4. GA then Phase 4 bypass removal

## Phase 3b: Upload early gate (2026-06-29)

When authority is on, `tryEarlyDecisionLoopGate` runs **before** `create_store` early draft returns:

- Reloads belief after OCR stash
- `hydrateBeliefForDecisionLoop` patches turn-1 `lastUpload`
- `present_options` → immediate `action: 'clarify'` + options (Ask panel chips)
- Skips `create_store` early draft when `_decisionLoop` + clarify/ingest

See `docs/IMPACT_REPORT_decision-loop-upload-hook.md`.

## Next: Phase 4

Remove P0 route bypasses; slim `performerIntakeV2Routes.js`.
