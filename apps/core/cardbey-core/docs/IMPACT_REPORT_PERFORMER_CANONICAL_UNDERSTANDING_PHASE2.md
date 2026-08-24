# Impact Report: Performer Canonical Understanding Phase 2

**Date:** 2026-07-28  
**Status:** Implementation  
**Branch:** `fix/canonical-understanding-create-store`  
**Depends on:** Phase 1 (`IMPACT_REPORT_PERFORMER_CANONICAL_UNDERSTANDING_PHASE1.md`)

---

## 1. Goal

Wire **BUE as primary enrichment** into create-store CanonicalUnderstanding, surface it on create_store draft responses, and require **user review** before POST when understanding is incomplete or marginal.

---

## 2. What could break

| Risk | Why | Impact |
|------|-----|--------|
| Extra BUE latency on create_store draft | Pipeline runs when analysis lacks a bundle | Upload Ask → Create store TTFB |
| Brand name overrides OCR name incorrectly | BUE brand preferred over OCR when merging | Wrong store name if BUE hallucinates |
| Handoff size / sessionStorage | Storing `businessUnderstanding` bundle | Quota / persist failures |
| STRICT + review blocks more creates | Incomplete/marginal always review-blocked | Logo-only flows need typed details |
| Tests mocking create_store draft | New optional BUE fields | Assertions that expect exact keys |

---

## 3. Smallest safe patch

1. **Core** — `buildCreateStoreDraftIntakeResponseFromUpload` reuses `attachmentAnalysis.businessUnderstanding` when present; otherwise runs BUE (non-fatal on failure). Returns `businessUnderstanding` + `merchantUnderstandingSummary` + `bueStatus`.  
2. **Core helper** — `projectCreateStoreFieldsFromBue` (brandName → create-store fields only; no parallel SOT).  
3. **Route** — Pass in-scope `attachmentAnalysis` into upload draft builder.  
4. **Dashboard** — Handoff field `businessUnderstanding`; `bundleToCreateStoreSourceFields` + `mergeSources` in `prepareUploadCreateStoreUnderstanding`.  
5. **Dashboard** — On create_store intake response, stash BUE and merge into repo.  
6. **Review gate** — If not `ready` / validation invalid / marginal confidence → show review copy, audit `user_review`, **do not POST** (STRICT). PERMISSIVE still logs and may proceed.  
7. **No** mandatory wizard screen; stay in agent stream.

---

## 4. No-parallel-stack proof

| Concern | Proof |
|---------|--------|
| Second BUE | Uses existing `runBusinessUnderstandingPipeline` / Core bundle |
| Replaces StoreCandidate | No — OCR candidate + BUE brand merge into dashboard projection only |
| New Intent Runtime | No |

---

## 5. Out of scope (later phases)

- Understanding quality dashboard / server audit API  
- Deleting BUE env vars  
- Full removal of all mixed-field draft assemblers in Core  
- E2E Playwright matrix for PTH / Handyman / Coffee  
