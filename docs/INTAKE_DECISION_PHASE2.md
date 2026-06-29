# Phase 2: Advisor Extraction & Shadow Rank

**Status:** Implemented  
**Depends on:** Phase 1 (`loadBelief` shadow)

## What was added

### Advisor registry (`lib/decision/advisors/`)

| Advisor ID | Wraps | Hypotheses |
|------------|-------|------------|
| `upload_ambiguity` | `assetUploadGuard`, upload phase rules | `analyze_asset`, `create_store_from_upload` |
| `explicit_store` | `storeCreateFastPath`, shortcut context | `create_store` |
| `ontology` | `INTENT_SUBTYPES` matchPatterns | subtype → intent |
| `document_ingest` | `documentIngestIntent` | `ingest_document` |
| `graphic_loyalty` | `intentDetectors`, promotion graphic | `generate_graphic`, `setup_loyalty` |
| `campaign_phrase` | `campaignOrchestrationIntent` | `create_campaign`, `create_store_first` |
| `continuity` | belief pending clarify / active goal | continuity boosts |
| `ocr_evidence` | belief.lastUpload | upload-based boosts |

Advisors are **scorers only** — they do not execute or override classification.

### Shadow rank

- `runAllAdvisors(belief, input)` → hypotheses
- `rankHypotheses(hypotheses, belief)` → merged ranked list + shadow tool
- `runIntakeShadowRank()` logs `[intake/shadow-rank]` and warns on divergence vs legacy `classification.tool`

Wired in `performerIntakeV2Routes.js` immediately before execution policy validation.

### Env

- `INTAKE_ADVISOR_SHADOW_ENABLED` (defaults to same as belief shadow)
- `INTAKE_ADVISOR_SHADOW_LOG=true` for verbose JSON logs

## Exit criteria (Phase 2)

- [x] Advisor registry with 8 advisors
- [x] Shadow rank on intake turns with belief + classification
- [x] Unit tests for advisors, rank, shadow compare
- [ ] ≥80% agree rate on staging sample (operational — monitor logs)

## Next: Phase 3

Promote `rankHypotheses` → `decideTurn()` behind `INTAKE_DECISION_LOOP_AUTHORITY`.
