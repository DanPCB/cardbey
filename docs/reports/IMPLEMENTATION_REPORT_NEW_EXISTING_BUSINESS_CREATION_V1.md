# Implementation Report: NEW + EXISTING Business Store Creation V1

**Date:** 2026-09-05  
**Impact:** `docs/IMPACT_REPORT_NEW_EXISTING_BUSINESS_CREATION_V1.md`

## 1. ROOT CAUSE

Three coupled failures:

1. Quick Card defaulted to AI-first clue entry → location/category often empty on submit.
2. No `creationMode` → no-evidence was treated like “unknown service” → generic Core Service seed.
3. Sparse florist fix stopped wrong generics but under-populated NEW business demos.

## 2. FILES CHANGED

| Area | Files |
|------|--------|
| Quick Card | `StoreCreationDraftCard.tsx` |
| Creation mode | `lib/storeCreation/storeCreationMode.js` (new) |
| Business context | `storeGenerationBusinessContext.js` |
| Starter catalogs | `industryBlueprintRegistry.js`, `seedCatalogBuilder.js`, `foodCuisineCatalog.js`, `buildCatalog.js` |
| Mission wire | `structured_store_build.js` |
| Media gate | `groundedStoreCreation.js` |
| Vertical | `verticalTaxonomy.js` (prior flower + noodles) |
| Docs | `IMPACT_REPORT_NEW_EXISTING_BUSINESS_CREATION_V1.md` |
| Tests | `newAndExistingBusinessCreationV1.test.js`, updated ambiguous fixture tests |

## 3. QUICK CARD BEFORE/AFTER

| Before | After |
|--------|--------|
| AI-first single clue by default | **Name + Location + Category** shown by default |
| Location/category behind “Enter details manually” | Structured Continue; AI clue optional via “simple entry” |

## 4. CREATION MODE DECISION

`resolveStoreCreationMode` → `EXISTING_BUSINESS` | `NEW_BUSINESS` | `AMBIGUOUS_BUSINESS`

- EXISTING: research found offerings / successful website research  
- NEW: no external evidence, semantic lock OK (e.g. My Flower → florist)  
- AMBIGUOUS: weak semantics → `needsClarification` + one prompt  

Attached on `storeGenerationBusinessContext.creationMode`.

## 5. NEW BUSINESS GENERATION PATH

`buildNewBusinessStarterCatalog` from industry blueprints:

- Populated categories + named starter offerings  
- `source = AI_GENERATED_STARTER`  
- `evidenceStatus = UNVERIFIED_NEW_BUSINESS`  
- **No fabricated prices**  
- `neverGenericService: true`  

Food NEW_BUSINESS uses cuisine banks with same provenance stamp.

## 6. EXISTING BUSINESS PATH

Unchanged research agents. Mode flips to EXISTING when research evidence present; priced/evidence catalogs still take precedence when `hasPriceList` / named grounded offerings exist.

## 7. OFFERING GENERATION

| Fixture | Result |
|---------|--------|
| My Flower | Florist starter (bouquets, arrangements, …) ≥6 items |
| NOODLE hut | food.asian cuisine starter ≥8 dishes |
| Unknown sparse | No Core Service packages |

## 8. MEDIA RELEVANCE GATE

`scoreSemanticMediaMatch`: florist context penalizes aviation/dental/office; boosts flower tokens. Wrong stock → fail accept threshold.

## 9. PROVENANCE MODEL

Starter meta: `AI_GENERATED_STARTER` / `UNVERIFIED_NEW_BUSINESS` / `editable: true` — not mixed with researched facts.

## 10–12. REGRESSION RESULTS (unit)

| Case | Status |
|------|--------|
| My Flower NEW no data | PASS |
| NOODLE hut NEW food | PASS |
| EXISTING research found | PASS (mode) |
| AMBIGUOUS weak Nova | PASS (mode) |

## 13. TESTS

```
vitest newAndExistingBusinessCreationV1.test.js  → 7 passed
vitest ambiguousBusinessNeverGenericService.test.js → 6 passed
```

## 14. REMAINING RISKS

1. **Clarification interrupt** — mode sets `needsClarification` but Performer UI may not yet block generation on AMBIGUOUS (still generates if caller ignores flag).  
2. **E2E preview** — not run against live local stack; unit path only.  
3. **Owner description → offerings** — not a dedicated rewrite pass yet.  
4. **Upload media priority** — relies on existing upload/OCR paths.  
5. Changes are **local** until commit/deploy.

## 15. FINAL VERDICT

**NOT** claiming `CARDBEY_NEW_AND_EXISTING_BUSINESS_CREATION_V1_READY` for production until:

- [ ] Local E2E draft preview for My Flower + NOODLE hut  
- [ ] AMBIGUOUS path surfaces one clarification in Performer before compose  
- [ ] Deployed core + dashboard

**Local golden-path unit gate:** **PASS** for NEW florist/food starters + never-generic + creationMode + Quick Card restore.
