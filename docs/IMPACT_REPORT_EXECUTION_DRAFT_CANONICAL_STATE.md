# Impact Report: Execution Draft Canonical Runtime State

## Change summary

Owner-input resume for loyalty topology now treats **`executionDraft`** as the single runtime source of truth. Attachment analysis remains immutable evidence; `attachmentAnalysis.missingFields` is never consulted after owner answers are merged.

## What could break

| Risk | Why |
|------|-----|
| Second `awaiting_owner_input` pause after Continue | Handlers or runner still trusted handler `missingFields` or attachment analysis instead of `computeMissingFields(executionDraft)` |
| `STALE_MISSING_FIELDS` thrown on valid resume | Assertion fires when draft has reward/stamps but recomputed missing list is non-empty |
| Downstream nodes missing reward/stamps | `executionDraft` not passed through `buildNodeInput` / `resumeTopologyFromOwnerInput` |
| Dashboard OwnerInputCard loop | Mission re-enters `awaiting_owner_input` because backend re-requested owner input |

## Impact scope

- `topologyExecutionDraft.js` (new canonical helpers)
- `topologyNodeRunner.js` — loyalty `buildNodeInput`, needs_input guard, cursor persistence
- `topologyExecutor.js` — `resumeTopologyFromOwnerInput` merge + validation
- `loyaltyStageHandlers.js` — `infer_requirements`, `generate_draft` use draft only
- Loyalty missions using typed topology with card upload + owner pause

## Smallest safe patch

1. `buildExecutionDraft` / `computeMissingFields` / `assertNoStaleMissingFields`
2. Runner: on `needs_input`, recompute from draft; auto-continue when `[]`; persist `executionDraft` on cursor
3. Resume API: merge owner fields → validate → pass `executionDraft` into execution context
4. Infer node: return `completed` OR `needs_input`, never both; never read attachment `missingFields`

## Regression coverage

- `topologyExecutionDraft.test.js` — merge, stale guard, evidence strip
- `loyaltyInferOwnerInput.test.js` — stale attachment after owner answer
- `topologyNodeRunner.resume.test.js` — no re-pause when draft complete
- `loyaltyOwnerInputResumeFlow.test.js` — full spine: pause once → resume → completed

## Expected runtime flow

```
Upload card → analyze → infer (needs_input) → owner answers → merge executionDraft
→ missingFields = [] → generate_draft → validate → persist → present_review → completed
```

`owner_input_requested` emitted **exactly once** on the happy path.
