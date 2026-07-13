# Impact Report: Business Understanding Engine (BUE)

**Date:** 2026-07-13  
**Scope:** Upgrade Performer Vision from OCR/layout reading to Business Understanding Engine

## What could break

1. **Intake routing** — If artifact classification overrides loyalty heuristics incorrectly, loyalty uploads could route to menu/flyer flows.
2. **Renderer contracts** — If canonical contracts replace `preseededDraft`/`cardTopology` before owner approval, published loyalty cards could use unapproved inferred values.
3. **Suitcase writes** — Premature persistence of inferred brand/rule contracts could pollute owner knowledge vault.
4. **Latency** — Additional vision/LLM phases on upload could exceed intake SLO (~19s loyalty path today).

## Why

- New pipeline stages run after existing `buildAttachmentAnalysis` vision enrichment.
- Contracts are additive (`businessUnderstanding` on analysis payload) until renderers explicitly consume them.
- Feature flag `BUE_PIPELINE_ENABLED` defaults **false** — zero behavior change until enabled.

## Impact scope

| Area | Risk | Mitigation |
|------|------|------------|
| Loyalty intake | Medium | BUE reads existing topology; does not replace `preseededDraft` |
| Performer UI | Low | Merchant summary is additive; dev diagnostics unchanged |
| Renderers | None (phase 1) | Still consume `cardTopology` + `rule`; BUE contracts are parallel |
| Suitcase | Low | Writes only when `persistToSuitcase: true` + owner scope |
| OCR paths | None | OCR remains enrichment; layout contract built from topology not raw OCR |

## Smallest safe patch (this PR)

1. Add `src/lib/businessUnderstanding/` module with phased pipeline orchestrator.
2. Classify → layout → intent → rules → brand → canonical contracts (structure only).
3. Attach `businessUnderstanding` + `merchantUnderstandingSummary` to `AttachmentAnalysis` when flag on.
4. Do **not** change renderer inputs or remove legacy fields.
5. Suitcase bridge is opt-in per call.

## Follow-up phases (not in this PR)

- Phase 7–9: Composition engine + channel renderers
- Phase 10: Owner approval upgrades `INFERRED` → `APPROVED` on all contract fields
- Phase 11: Automatic suitcase promotion on publish
- Phase 12: Dashboard hides dev diagnostics for merchants (dashboard change)
