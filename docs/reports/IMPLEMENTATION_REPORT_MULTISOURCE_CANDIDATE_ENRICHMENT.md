# Implementation Report — Multi-Source BusinessCandidate Enrichment

Date: 2026-08-14  
Status: **COMPLETE — ready for review** (no QA hook, no Prisma provenance promotion)  
Impact report: [`IMPACT_REPORT_MULTISOURCE_CANDIDATE_ENRICHMENT.md`](./IMPACT_REPORT_MULTISOURCE_CANDIDATE_ENRICHMENT.md)

---

## What shipped

### 1. Optional fields on `BusinessCandidateRecord`
All additive / nullable / undefined-safe. Existing fixtures that omit them still pass.

- `description`, `category`, `tags`, `heroImageUrl`, `heroImageSource`
- `biBrief`, `biStatus`, `abn`, `legalName`, `openingHours`
- `enrichmentNote`, `claimUrl`, `enrichmentSources`, `enrichmentUpdatedAt`
- `enrichmentRunId` (cuid correlating a run’s provenance rows)

### 2. JSON provenance sidecar
- Path: `apps/core/cardbey-core/data/businessCandidates/enriched-field-provenance.json`
- Repo: `businessCandidate/enrichment/provenanceRepository.ts`
- Every row includes **`enrichmentRunId`**
- Helpers: `listProvenanceForRun`, `deleteProvenanceForRun` (rollback handle)
- **Prisma `EnrichedFieldProvenance` untouched**

### 3. Agent under `businessCandidate/enrichment/`
| Module | Role |
|--------|------|
| `multiSourceEnrichmentAgent.ts` | Per-record orchestrator + freeze asserts |
| `runBatchEnrichment.ts` | Batch loop with **Batch 0 skip inside the loop** |
| `budget.ts` | Hard caps: 5 fetches / 3 Claude / 10 min (`runWithDeadline`) |
| `constants.ts` | `PROTECTED_BATCH_IDS = ['MELBOURNE_BATCH0_20260617']` |
| `abrLookup`, `webExtractors`, `osmCrossRef`, `heroImageResolve`, `categoryMap`, `synthesize` | Tier ladder sources |

**Not** exported from `businessCandidate/index.ts` (no discovery/QA auto-pull).

### 4. Opt-in entrypoints only
- **Admin route:** `POST /api/business-candidates/enrich/multi-source`  
  - `requireAuth` + `requireAdmin` (same gate pattern as `/api/intelligence/metrics`)  
  - Rate-limited  
  - **`batchId` required** in body (400 if missing)
- **Script:** `pnpm enrich:candidates -- --batchId=<ID> [--dry-run]`  
  - Bare invoke **exits 1** with usage error (verified)

### 5. Batch 0 freeze (in-loop)
```js
if (PROTECTED_BATCH_IDS.includes(candidate.batchId)) {
  log.warn(`Skipping … — protected batch …`);
  continue;
}
```
Present in `runMultiSourceEnrichmentBatch` **and** `runMultiSourceEnrichmentOnCandidates` so script/admin cannot bypass.

### 6. Brief scoring compatibility
`generateBusinessIntelligenceBrief` now treats first-class `candidate.description` as description evidence (in addition to `originalContent.description`).

---

## Guardrail checklist

| Constraint | Status |
|------------|--------|
| Optional fields only | Done |
| JSON sidecar; Prisma provenance unchanged | Done |
| Agent outside discovery/QA; no barrel auto-export | Done |
| Hard caps enforced in `EnrichmentBudget` | Done |
| Admin auth + script `--batchId` required | Done |
| Batch 0 skip in agent loop | Done |
| `enrichmentRunId` on every provenance row | Done |

---

## Tests

`src/lib/businessCandidate/__tests__/multiSourceEnrichment.test.ts` — **9 passed**

- Optional fields omitted remain valid  
- Protected Batch 0 skipped in loop  
- Fetch / Claude / wall-clock caps throw  
- Provenance `enrichmentRunId` + delete-by-run  
- Category map + quality floor  
- Freeze detection  
- Enrich does not mutate `status` / `batchId` / `seedId`  

Existing `businessCandidate.test.ts` — still passing (fixtures unchanged).

---

## How to run (when inventory exists)

```bash
pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL --dry-run
pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL
```

Report output: `docs/reports/ENRICHMENT_MULTISOURCE_<batchId>_<timestamp>.md`

Admin:
```http
POST /api/business-candidates/enrich/multi-source
Authorization: admin
{ "batchId": "MELBOURNE_BATCH001_REAL_LOCAL", "dryRun": true }
```

---

## Explicitly not done (per scope)

- QA approve / discovery auto-hook  
- Prisma `EnrichedFieldProvenance` shape promotion  
- Restoring empty local `candidates.json` inventory  
- Owner contact / Places photo public cache  

---

## Review notes

Local `candidates.json` is still empty — enrichment code is ready, but a live batch run needs restored Batch 001+ candidates first. After review, next optional steps are inventory restore → dry-run → live enrich → (later) QA UI hook / Prisma mirror.
