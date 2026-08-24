# IMPACT REPORT — Website Extraction Pipeline E2E Refactor

Date: 2026-08-25  
Scope: `BusinessCandidate` multi-source website enrichment extractors (Anison reference)  
Status: **IN PROGRESS** — Phase-gated; candidate-only until QA  
Master prompt: Website Extraction Pipeline E2E Refactor

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Over-aggressive nav blocklist drops real services named like nav labels | Medium |
| Contact regex misses AU phone formats or strips valid catalog names | Medium |
| Sub-page fetches (Phase 4) increase rate limits / timeouts | Medium |
| Taxonomy expansion mis-routes non-M&A businesses into Professional | Medium |
| Hero query changes worsen stock images for some verticals | Medium |
| Accidental writes to Business / DraftStore / BusinessSeed / User | High — **forbidden** |
| Batch 0 protected candidates changed by backfill | High if backfill skips guards |

## (2) Why

Current `webExtractors` treat nav/contact strings as catalog items, ignore footer/about description, miss social links, skip service sub-pages, and fall through to weak category/hero queries (`Other` + generic storefront).

## (3) Impact scope

- `apps/core/cardbey-core/src/lib/businessCandidate/enrichment/*`
- `apps/core/cardbey-core/src/config/categoryTaxonomy.ts`
- Candidate JSON / provenance only (until explicit backfill)
- Public store create/publish paths **not** modified in Phases 1–6

## (4) Smallest safe approach

Phase-gated patches with unit + Anison diagnostic gates. No Business/Seed/Draft writes during phases. Backfill only after Phase 6 with dry-run first.
