# Store Creation Grounding Pass 2 — Implementation Report

**Date:** 2026-08-12  
**Worktree:** `C:\Projects\cardbey-wt-store-gen-p2`  
**Verified prior failure:** `STORE_CREATION_PASS1_RUNTIME_MISMATCH_G_QA_TIER2_CUISINE_REENTRY`

## Verdict

```text
GROUNDED_STORE_CREATION_END_TO_END_INVARIANT_READY
```

Automated final-DTO boundary regression (Pass 2 suite) **passes**.  
**Runtime Noodle Hut re-test is still required** before calling Pass 2 complete in production (see §15).

---

## 1. Root cause confirmed

1. **F:** Trading-hours OCR (`NOODLE hut Trading Hours Monday-Thursday 11.30 am`) classified as a grounded offering → invent-stop bypassed.
2. **G:** `storeBuildQa` Tier2 `catalog_regenerate` → `buildReplacementProducts` → `buildCuisineMenuCatalog` invented **Edamame**, then provenance was laundered to `VERIFIED` / `origin=evidence` / `catalogSource=grounded_evidence`.
3. Media `needs_media` coexisted with a live `imageUrl`; QA reported semantic match.
4. Customer copy interpolated internal **Other**; authority trace attached at finalize but wiped/absent after QA.

---

## 2. Downstream factual writer audit

| Writer | Customer-facing facts? | After composition? | Gets grounding context? | Can invent? | Assigns provenance? | Attaches media? | Pass 2 disposition |
|--------|------------------------|--------------------|-------------------------|-------------|---------------------|-----------------|---------------------|
| `composeGroundedStoreIntelligence` / `collectEvidenceOfferings` | Yes (offerings) | Creates composition | Flag + classifier | No (extract only) | Marks VERIFIED for offerings | No | Filter non-OFFERING |
| `applyCompositionToGenerationParams` | Seeds catalog | Yes | Yes | Only authoritative | Via seed | No | Hours rejected |
| `buildCatalog` + invent-stop | Yes | Yes | `isGrounded…` | Blocked when grounded+empty | Meta | No | Unchanged + stricter offerings |
| `buildCatalogFromGroundedOfferings` | Yes | Yes | Yes | No invent | VERIFIED only for authoritative | No | Filters hours |
| `foodCuisineCatalog.buildCuisineMenuCatalog` | Yes | Via QA/templates | `grounded` opt | Yes if ungrounded | GENERATED_FALLBACK | No | QA must not call under grounded |
| `draftCatalogQa.buildReplacementProducts` | Yes | Yes | **Now** `canInventCatalogFacts` | **No when GROUNDED** | GENERATED_FALLBACK if invent | Clears media on replace | **Primary G fix** |
| `applyDraftCatalogQaTier1/Tier2` | Yes | Yes | Policy from meta | Remove unsupported | No laundering | Invalidate on change | Grounded remove path |
| `regenerateCatalogProductSlots` | Yes | Yes | Policy | Blocked when grounded | Same | Invalidate | Grounded remove |
| `storeBuildQaAutoFix` | Yes | Yes | Via QA + reattach | Via Tier2 | Via QA | Hero/avatar/item | Re-attaches authority trace |
| `finalizeDraft` leak/cuisine repair | Yes | Yes | Pass1 skip when grounded | Blocked | — | Item media gate | Unchanged |
| `websiteSectionsGenerator` | Copy | Yes | `displayBusinessTypeForCopy` | N/A | N/A | Hero | Other-safe |
| Industry/seed blueprints | Yes | Via QA | Via invent gate | Generative only | GENERATED_FALLBACK | No | Gated |

**Grounding Monotonicity Invariant:** provenance rank must not increase without new evidence (`canUpgradeProvenance` / `assignItemProvenance`).

---

## 3. Offering classifier

- New: `generationGroundingPolicy.js` → `classifyEvidenceKind`, `isAuthoritativeOffering`
- Kinds: BUSINESS_IDENTITY, OFFERING, PRICE, OPENING_HOURS, CONTACT, LOCATION, PROMOTION, POLICY, OTHER
- Hours patterns: trading/opening hours, Mon–Sun, AM/PM ranges, open/closed
- `hasAuthoritativeOfferings` uses `isAuthoritativeOffering` only
- `collectEvidenceOfferings` / `extractOfferingLinesFromText` filter non-OFFERING

---

## 4. Tier2 / QA changes

Under `generationPolicy.mode === GROUNDED` (or `meta.groundedStoreCreation`):

- **May:** remove unsupported items, mark `INCOMPLETE_MISSING_EVIDENCE`, fix Other copy, normalize formatting
- **Must not:** cuisine/industry/seed invent, fabricate prices as factual fill, launder provenance
- Outcomes: `GROUNDED_QA_OUTCOME.*`

---

## 5. Provenance

- `assignItemProvenance` refuses VERIFIED/evidence laundering for generated claims
- Replacement products stamped `GENERATED_FALLBACK` / non-evidence origin when invent allowed

---

## 6. Media

- `clearCustomerFacingItemMedia` / `markItemNeedsMedia`: `imageUrl=null`, optional `candidateImageUrl`
- `invalidateItemDerivedMedia` on identity change
- QA report counters adjusted for `needs_media` after autofix

---

## 7. OTHER handling

- `displayBusinessTypeForCopy` used in QA tagline/description builders
- Tier1 rewrites slogans containing `quality Other` / `local Other`

---

## 8. Authority trace lifecycle

1. **finalizeDraft** — attach `storeCreationAuthorityTrace` + `generationPolicy` (`authorityTraceLifecycle: finalizeDraft`)
2. **post storeBuildQa** — re-attach (`authorityTraceLifecycle: post_storeBuildQa`) so Tier2 cannot leave final DTO without trace

---

## 9. Grounding context propagation

- `resolveGenerationGroundingPolicy(ctx)` → `{ mode: GROUNDED|GENERATIVE, canInventCatalogFacts, … }`
- Stamped on `preview.meta.generationPolicy`
- Downstream writers consult `canInventCatalogFacts` rather than ad-hoc `if (grounded) return []` only in one place

---

## 10. Tests added

`src/lib/storeGeneration/__tests__/pass2GroundingInvariant.test.js`

| Test | Result |
|------|--------|
| A hours ≠ offerings | pass |
| B no cuisine invent | pass |
| C Tier2 no re-entry | pass |
| D provenance laundering | pass |
| E media invalidation | pass |
| F Other suppression | pass |
| G authority trace | pass |
| Final DTO boundary | pass |

Also green: Pass1 golden (9), P0 forensic (9). **26/26** in combined run.

---

## 11. Full-pipeline regression

Final-boundary assertion in Pass2 suite covers: hours → empty catalog → Tier2 → no Edamame → Other-safe copy → trace present.

---

## 12. typecheck / test / lint / build

- Vitest Pass0/1/2: **26 passed**
- Full monorepo typecheck/lint/build not run in this pass (core unit scope)

---

## 13. Files changed

| File | Role |
|------|------|
| `docs/IMPACT_REPORT_STORE_CREATION_GROUNDING_PASS2.md` | Impact |
| `docs/IMPACT_REPORT_STORE_CREATION_GROUNDING_PASS2_IMPL.md` | This report |
| `…/draftStore/generationGroundingPolicy.js` | **New** shared policy |
| `…/draftStore/groundedStoreCreation.js` | Offering authority + media clear |
| `…/lib/storeGeneration/buildGroundedComposition.js` | Classify + seed filter |
| `…/qa/draftCatalogQa.js` | Grounded QA remove path |
| `…/qa/storeBuildQaAutoFix.js` | Trace reattach + media report |
| `…/draftStore/draftStoreService.js` | Policy + trace at finalize |
| `…/__tests__/pass2GroundingInvariant.test.js` | **New** regressions |

---

## 14. Remaining known re-entry risks

- LLM catalog paths that invent before policy if flag off mid-request
- UI that renders `candidateImageUrl` if wired incorrectly later
- Non-QA “enhance/hydrate” writers outside draft-store (publish projection) — not fully rewritten
- Owner-approved Tier2 with **explicit** invent ids under grounded still blocked by `canInventCatalogFacts` (intentional)

---

## 15. Runtime QA instructions

1. Restart worktree Core with:
   - `ENABLE_GROUNDED_STORE_CREATION_V1=true`
   - `ENABLE_RESOURCE_GROUNDED_STORE_GENERATION_V1=true`
   - `DATABASE_URL=file:C:/Projects/cardbey/apps/core/cardbey-core/prisma/dev-fresh.db?...`
2. Confirm `/api/health?full=true` → `groundedStoreCreation.v1: true`
3. Dashboard: prefer proxy `127.0.0.1:3001` (fix stale `VITE_CORE_BASE_URL=192.168.1.10` if needed)
4. **New** mission: Create store NOODLE hut + same business card (do not reuse old mission/draft)
5. Expect:
   - Menu empty / incomplete (no Edamame)
   - Hours not a menu item
   - No `quality Other` / `local Other`
   - Order CTA if archetype policy supports
   - `preview.meta.storeCreationAuthorityTrace` + `generationPolicy.mode=GROUNDED`
   - No unrelated item image
6. Record missionId, draftId, catalog, provenance, media, trace + screenshot

Do **not** declare Pass 2 complete until this runtime proof succeeds.
