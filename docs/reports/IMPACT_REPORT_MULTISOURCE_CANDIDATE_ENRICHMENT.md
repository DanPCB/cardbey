# IMPACT REPORT — Multi-Source BusinessCandidate Enrichment Agent

Date: 2026-08-14  
Scope: Extend `BusinessCandidate` + field provenance + opt-in multi-source enrichment pipeline  
Status: **IMPLEMENTED** — awaiting review before QA hook / Prisma provenance promotion  
Source prompt: `multi-source-enrichment-prompt.md`

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Existing candidate JSON / test fixtures fail type checks if new fields are **required** | High |
| Accidental writes to `BusinessSeed` / `Business` / `DraftStore` / `User` if pipeline reuses seed enrich helpers carelessly | High |
| Mutating `batchId`, `seedId`, `status`, claim-related fields during enrichment | High |
| Changing Prisma `EnrichedFieldProvenance` shape breaks ghost-store + Batch0 seed provenance (`storeId` + `fieldPath` only) | High |
| Auto-running enrichment on discovery/QA approval → rate limits, ToS, slow QA, owner-contact-adjacent fetches | High |
| Overwriting Tier-1 website data with weaker aggregator/Places fallbacks | Medium |
| Brief / health-score logic only reads `originalContent.description` → new `description` field ignored → stale QA metrics | Medium |
| Public claim pages show wrong stock heroes if Pexels/Pixabay selection is loose | Medium |
| Protected Batch 0 candidates enriched despite `isProtectedBatch0` guard if new path bypasses it | Medium |
| Dashboard API types / sample fixtures drift if Core exports new fields without optional typing | Low |

---

## (2) Why

The mission prompt assumes claimable-page enrichment fields (`description`, `category`/`tags`, `heroImageUrl`, `biBrief`/`biStatus`, ABN notes, `EnrichedFieldProvenance` with tier/source/rawExtract) on **BusinessCandidate**.

Today (pre-patch):

- `BusinessCandidateRecord` had no first-class enrichment fields; descriptions (when present) lived in `originalContent`.
- Local `candidates.json` is empty; enrichment for seeds uses `enrichmentProfile` on **BusinessSeed** (forbidden target for this agent).
- Existing `enrichCandidateForPublicDisplay` only does media discovery + intelligence brief — not multi-source web/ABN/OSM ladder.
- Prisma `EnrichedFieldProvenance` is store-scoped (`storeId`, `fieldPath`, `sourceUrl`, `confidence`) — too narrow for candidate tier provenance, and shared with ghost stores.

A naive “add columns everywhere + auto-enrich” change would touch seed/claim/ghost paths. The safe approach is **additive, opt-in, candidate-only**.

---

## (3) Impact scope

### In scope (smallest safe patch) — IMPLEMENTED

| Area | Change |
|------|--------|
| `apps/core/.../businessCandidate/types.ts` | Optional enrichment fields on `BusinessCandidateRecord` |
| New: `enrichment/` modules under `businessCandidate/` | Multi-source pipeline |
| New: `provenanceRepository.ts` | JSON file store `enriched-field-provenance.json` with `enrichmentRunId` |
| Admin route + script | Opt-in only; `batchId` required |
| Brief scoring | Also treats first-class `description` as evidence |
| Tests | Caps, freezes, quality floor, Batch 0 skip, provenance run id |

### Explicitly out of scope

- Writing to `BusinessSeed`, `Business`, `DraftStore`, `User`
- Changing `verificationStatus` / claim status / `batchId` / `seedId`
- Prisma migration of `EnrichedFieldProvenance`
- Owner contact
- Google Places photo caching for public display
- Auto-enrich on ingest or QA approve
- Dashboard UI redesign

---

## (4) Smallest safe patch — applied

See [`IMPLEMENTATION_REPORT_MULTISOURCE_CANDIDATE_ENRICHMENT.md`](./IMPLEMENTATION_REPORT_MULTISOURCE_CANDIDATE_ENRICHMENT.md).

---

## Confirmation checkpoint

User confirmed **Proceed** with five guardrails + `enrichmentRunId`. Patch applied. Next review gate: QA hook / schema promotion only after explicit approval.
