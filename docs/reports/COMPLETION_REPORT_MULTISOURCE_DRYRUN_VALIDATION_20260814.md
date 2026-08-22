# Multi-Source Enrichment — Inventory Recovery + Dry-Run Validation

Date: 2026-08-14  
Foundation status (unchanged for observed public sparse business):

```text
BUSINESS_MULTI_SOURCE_ENRICHMENT_FOUNDATION_READY_UNVALIDATED
```

---

## VERDICT

**PARTIAL**

- Named target **Đại Thắng / Braybrook** could **not** be linked to any authoritative candidate/seed/business ID in this workspace → **lineage stop**.
- Recovered **8** real Braybrook `open_data_url` seeds into `MELBOURNE_BATCH001_REAL_LOCAL` (non-synthetic).
- Dry-run on **Papa Bakehouse** (`candidate:145c96c7-…`) completed with isolation verified (canonical fields unchanged).
- Not `BUSINESS_MULTI_SOURCE_DRY_RUN_VALIDATED` for the observed public Đại Thắng profile (never found).
- Not `COMPLETE` — public profiles unchanged; no canonical write; no QA/Prisma promotion.

---

## INVENTORY

### Root cause of empty inventory
**INVENTORY_NOT_PERSISTED** (primary)

Supporting:

- **INVENTORY_ENVIRONMENT_SPECIFIC** — Braybrook seeds only in `prisma/dev-fresh.backup-pre-migrate.db`, not current `seeds.json` / `dev.db`
- **CANDIDATE_LINK_MISSING** — intelligence briefs used `seed:{id}` without `candidates.json` rows
- Git history for `candidates.json` only ever committed `[]`

Public discovered cards can be served from BusinessSeed / UnclaimedStore **without** persisting BusinessCandidate.

### Recovery source
`prisma/dev-fresh.backup-pre-migrate.db#business_seed(open_data_url,Braybrook)`  
Report: `docs/reports/INVENTORY_RECOVERY_BRAYBROOK_BATCH001.md`  
Script: `scripts/recover-braybrook-candidates.ts`

### Candidate count / batch
- **8** candidates
- Batch: `MELBOURNE_BATCH001_REAL_LOCAL` (existing authoritative Batch 001+ ID)
- Synthetic: **false**
- Test pollution `ABC Bakery` removed after recovery

### Target linkage (Đại Thắng)
| Field | Value |
|-------|--------|
| Cardbey business ID | **NOT_FOUND** |
| Business-candidate seed ID | **NOT_FOUND** |
| Acquisition batch ID | **NOT_FOUND** |
| Acquisition source | **NOT_FOUND** |
| External source ID | **NOT_FOUND** |
| Address/coordinates | **NOT_FOUND** |
| Original seed evidence | **NOT_FOUND** |

Searched: data JSON, docs, git `-S`, backup SQLite `Business` / `UnclaimedStore` / `business_seed` — zero hits.  
**Did not manufacture a candidate from UI/screenshot.**

### Batch 0 evidence
`PROTECTED_BATCH_IDS = ['MELBOURNE_BATCH0_20260617']` enforced in enrichment loop; recovery writes only Batch 001 Real Local.

---

## TARGET BUSINESS

Observed display name **Đại Thắng** (Braybrook VIC) — **NOT_FOUND** in authoritative inventory.

Identity result: **NOT_MATCHED** (no candidate to match).

**Stop condition hit:** target Business cannot be linked to a candidate; recovery would require production extraction for that listing.

---

## SOURCE RESULTS

Adapter capability (current environment):

| Adapter | Input | Network/API | Fields | Identity checks | Failure states | Publication rights |
| ------- | ----- | ----------- | ------ | --------------- | -------------- | ------------------ |
| `abrLookup` | name + state | abr.business.gov.au HTML | abn, legalName, status | legal corroboration only; cancel requires high confidence near ABN | NOT_FOUND, PARTIAL | Legal reference — not marketing overwrite |
| `webExtractors` | website / social / YP URL | HTTP fetchHtml | description, og:image, hours, bio | relies on caller identity gate | empty HTML → NOT_FOUND | Owner-site Tier 1 when URL known |
| `osmCrossRef` | name + suburb | Overpass API | amenity/shop/hours/cuisine | geographic corroboration | TIMEOUT / NOT_FOUND | OSM attribution required |
| `heroImageResolve` | og:image / stock APIs | optional Pexels/Pixabay | heroImageUrl | rejects logo/icon; stock = reference-only | **NO_ELIGIBLE_MEDIA**, NOT_CONFIGURED | Business-owned og only eligible |
| `categoryMap` | local signals | none | category, tags | deterministic mapping | defaults Other | N/A |
| `synthesize` | confirmed evidence | optional Anthropic | description, biBrief | rejects unsupported inferences | rejected / rule fallback | AI marked separately |

### Papa Bakehouse dry-run (real Batch 001 candidate)

| Source | Status | Identity | Fields | Failure/limitations |
|---|---|---|---|---|
| abr_lookup | SUCCESS (probational) | PROBABLE_MATCH only — first ABN on Active search; **needs corroboration** before marketing link | abn=`81617715045` | Do not treat as verified trading-name legal identity |
| business_website | NOT_FOUND | — | — | seed website=null → NO_WEBSITE |
| instagram/facebook | SKIPPED | — | — | no social URLs on seed |
| openstreetmap | attempted via fetch budget | — | — | thin; OSM node in sourceReference exists on seed |
| yellow_pages | may consume fetch | — | — | not used as public description |
| pexels/pixabay | NOT_CONFIGURED | — | — | no API keys |
| unsplash category | UNSUPPORTED | — | — | not enrichment evidence |
| rule_synthesised | SUCCESS | grounded | minimal description + BI brief | 12 words — below ENRICHED floor |

---

## FIELD PROPOSALS

From dry-run proposals (`ENRICHMENT_MULTISOURCE_DRYRUN_…1117.proposals.json`):

| Field | Before | Proposed | Source | Confidence | Decision |
|---|---|---|---|---|---|
| description | null | `Papa Bakehouse is listed as a food & drink business in Braybrook.` | rule_synthesised | 0.55 | **HOLD** — grounded but sparse |
| category | null | Food & Drink | rule_synthesised / seed food | 0.85 | **HOLD** pending QA |
| tags | null | bakery, braybrook | rule_synthesised | 0.65 | **HOLD** |
| abn | null | 81617715045 | abr_lookup | 0.85 legal / low marketing | **HOLD** — corroborate before accept |
| heroImageUrl | null | null | — | — | **NO_ELIGIBLE_MEDIA** |
| openingHours | null | null | — | — | missing |
| status/batchId/seedId | CLAIMABLE / REAL_LOCAL / seed id | unchanged | freeze | — | **unchanged on disk** |

Canonical on-disk after dry-run: `description=null`, `biStatus=not_generated`, `enrichmentRunId=null` ✓

---

## MEDIA/CATALOG

- Eligible media: **none** → `NO_ELIGIBLE_MEDIA`
- Rejected: category stock / unconfigured Pexels-Pixabay / no website og:image
- Products/services found: **none**
- Missing: website, phone, hours, catalog, eligible visuals

---

## SYNTHESIS

- Policy: `enrichment-synthesis-v1`
- Model: not used on Papa Bakehouse dry-run (`claudeCalls: 0`); rule-based minimal description
- Evidence used: name + mapped category + suburb only
- Generated fields: minimal description + BI brief text (proposal only)
- Unsupported claims rejected: adversarial tests cover Colorbond/timber/gate repair/free quotes + banned adjectives (**passed**)

---

## READINESS

Papa Bakehouse (recovered sparse seed):

- **Before:** `DISCOVERED_SPARSE`
- **After (proposed):** still `DISCOVERED_SPARSE` / at best `PARTIAL` — AI/rule description alone does **not** pass description dimension when flagged AI-only; no eligible media; no catalog; no operations
- Public minimum: **no**
- Business Health Report eligibility: **no**

Đại Thắng public profile: **unchanged** (never in inventory).

---

## PROVENANCE SAFETY

| Concern | Status |
|---------|--------|
| Atomic write (tmp + rename) | Yes |
| In-process serialized RMW (`writeChain`) | Yes — fixed (read+merge inside lock) |
| Cross-process lock | **Unsupported** — document limitation; HTTP concurrent lock added |
| Corruption recovery | Quarantine + empty recover |
| Duplicate run/field idempotency | Yes |
| Rollback by `enrichmentRunId` | Yes |
| Dry-run isolation | `enriched-field-provenance.dry-run.json` separate; live rows stayed **0** |
| Secrets in rawExtract | Redaction heuristic |
| Runtime classification | **`development_pilot_runtime_state_temporary_bridge`** — not source-controlled SoT; dry-run file gitignored |

---

## ADMIN ENDPOINT SAFETY

`POST /api/business-candidates/enrich/multi-source`

- Auth: `requireAuth` + `requireAdmin`
- `batchId` required
- Protected Batch 0 rejected
- **dryRun defaults to true** (live requires explicit `dryRun:false`)
- Rate limit retained
- maxCandidates capped (25); live HTTP capped at **3**
- In-process concurrent lock (409 if busy)
- Empty inventory → error `INVENTORY_EMPTY`
- Long sync 10-min HTTP: mitigated by dry-run default + live size cap; full job system **not** added

---

## TESTS

| Suite | Result |
|-------|--------|
| `enrichmentValidationPhase.test.ts` (14) | PASS — provenance concurrency/corruption/dry-run, identity, synthesis adversarial, readiness |
| `multiSourceEnrichment.test.ts` (9) | PASS |
| `businessCandidate.test.ts` (7) | PASS (earlier) |

---

## EXPLICITLY NOT DONE

- Canonical write / live enrich accept
- Public publication / cache invalidation
- QA approval hook
- Prisma provenance promotion
- Global rollout
- Production data pull for Đại Thắng
- Manufacturing Đại Thắng candidate

---

## NEXT DECISION

1. **Đại Thắng:** obtain authoritative acquisition identity from staging/production ops (businessId + seedId + batchId) — do not reconstruct from UI.
2. **Inventory persistence strategy:** decide whether Batch 001 candidates remain file-backed pilot state or promote to durable DB.
3. **Provenance persistence strategy:** keep sidecar bridge until shape stable; then Prisma promotion (separate change).
4. **Official-website Batch B:** only after website URLs exist on candidates; current Braybrook recovery has **website=null** on all 8.
5. Approve/reject treating ABR first-hit ABN as proposal vs requiring stronger identity match before even proposing.

---

## INVENTORY RECOVERY (summary block)

- Source of recovered records: backup SQLite Braybrook `open_data_url` seeds  
- Candidate count: 8  
- Batch IDs: `MELBOURNE_BATCH001_REAL_LOCAL`  
- Target candidate linkage: **Đại Thắng NOT_FOUND**  
- Fields preserved: seedId, batchId, externalId (OSM node), sourceUrl, name, address/suburb, source type, timestamps, dedupeKey  
- Fields unavailable: website, phone, email, coordinates, Cardbey Business ID, Đại Thắng  
- Batch 0 protection evidence: recovery batch ≠ `MELBOURNE_BATCH0_20260617`  
- Synthetic: **false**
