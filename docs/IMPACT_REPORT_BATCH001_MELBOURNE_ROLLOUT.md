# Impact Report — Batch 001 Performer-First Business Onboarding

**Date:** 2026-06-27  
**Status:** Phase 1 foundation implemented  
**Architecture:** Performer-first, mission-driven — **not CRM-first**

---

## Core principle

One canonical lifecycle. No parallel state machines.

```
Discovery → BusinessCandidate → Performer Reasoning → Store Draft → Owner Review → Published → Active
```

CRM stages are **derived overlays** on Runtime status — never stored independently.

Melbourne Batch 0 (`MELBOURNE_BATCH0_20260617`) is unchanged — engineering validation only.

Melbourne Batch 001 (`MELBOURNE_BATCH001_20260627`) uses the Performer-first pipeline.

---

## What was implemented (Phase 1)

### New module: `apps/core/cardbey-core/src/lib/businessCandidate/`

| File | Purpose |
|------|---------|
| `types.ts` | `BusinessCandidateRecord`, status lifecycle, content provenance, runtime events |
| `batch001Config.ts` | Batch 001 ID, suburbs, industries, target count |
| `candidateRepository.ts` | JSON persistence (`data/businessCandidates/`) |
| `candidateLifecycle.ts` | Single canonical state machine + audit transitions |
| `candidateRuntimeEvents.ts` | Platform activity events (`business_discovered`, etc.) |
| `businessOnboardingMission.ts` | Creates `business_onboarding` GUIDED_RUN mission per candidate |
| `candidateIngestionPipeline.ts` | Discovery → Candidate + mission (**never** Store/Seed) |
| `contentProvenance.ts` | `ORIGINAL` / `AI_GENERATED` / etc.; publish gate for demo content |
| `crmOverlay.ts` | Derives CRM labels from runtime status |
| `buildBatchMetrics.ts` | Runtime-derived batch intelligence metrics |
| `__tests__/businessCandidate.test.ts` | Lifecycle, CRM overlay, demo publish gate |

### Discovery Engine integration

- `runPerformerFirstDiscoveryEngine()` — Batch 001 discovery path
- `buildBatch001OnboardingMetrics()` — pipeline + CRM overlay counts
- API:
  - `POST /api/discovery-engine/batch-001/discover`
  - `GET /api/discovery-engine/batch-001/metrics`

### Mission pipeline

- `business_onboarding` registered in `intentPipelineRegistry.js`

### Unchanged (Batch 0 safe)

- `runDiscoveryEngine()` → `DiscoveryPromotionPipeline` → `BusinessSeed` (existing path)
- QA / Claims / Activation runway for Batch 0 seeds
- `BusinessOnboardingWizard` (legacy; batch cohort will route to Performer in Phase 2)

---

## Acceptance criteria progress

| Criterion | Status |
|-----------|--------|
| Discovery creates BusinessCandidate instead of Store | ✅ Batch 001 path |
| Every BusinessCandidate has Performer onboarding mission | ✅ On ingest |
| Performer primary onboarding experience | 🔶 Mission created; intake wiring Phase 2 |
| Store Draft after reasoning only | 🔶 `attachStoreDraftToCandidate` ready; Performer tools Phase 2 |
| Original vs AI content distinguished | ✅ Provenance types + publish gate |
| Demo content cannot publish accidentally | ✅ `assertPublishableNoDemoContent` |
| CRM reflects Runtime | ✅ `crmOverlay.ts` derived only |
| Dashboard visualizes Runtime | 🔶 API ready; UI Phase 3 |
| Batch Intelligence from Runtime | ✅ `buildBatchOnboardingMetrics` |
| Community feed highlights new businesses | 🔶 Phase 4 |
| Runtime Authority only execution engine | ✅ No bypass paths added |
| Batch 0 preserved | ✅ Separate batch IDs and pipelines |

---

## Phase 2 (next)

1. **Performer intake wiring** — business card / OCR → candidate enrichment → conversation UI
2. **Store draft generation** — Performer tools create draft via Runtime; link via `attachStoreDraftToCandidate`
3. **Discovery Center UI** — runtime pipeline visualization using `/batch-001/metrics`
4. **Community feed** — batch-scoped "Recently Joined" rails for published Batch 001 stores

---

## Governance

- `business_onboarding` missions use `requiresConfirmation: true` and `GUIDED_RUN`
- Publish blocked when unreplaced demo content remains
- Owner contact / outreach actions must use safe-execution governance (not auto-executed)
