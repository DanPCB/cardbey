# Business-Aware + Brand-Grounded Store Generation — Architecture Audit

**Date:** 2026-08-10  
**Phase:** 1 — Audit + contracts  
**Verdict:** `BUSINESS_AWARE_STORE_GENERATION_FOUNDATION_READY`

## Product principle (locked)

Cardbey understands the business, then generates the appropriate digital expression.  
Performer remains the runway. Resources / URI supply materials. Manual edit remains optional.

## Current end-to-end path

```
User / Performer create_store
  → Intake V2 + StoreCreationDraft (+ optional extract-card / IntakeEvidenceBundle)
  → createStoreCheckpointDispatch → MissionPipeline (store)
  → structured_store_build.execute
  → createBuildStoreJob (draftMode default 'ai')
  → generateDraft → resolveGenerationParams → buildCatalog
  → mergeWebsiteIntoPreview + content resolution
  → preview.website DTO → WebsitePreviewPage / CanonicalStorefrontRenderer
```

### Key files

| Stage | Path |
|-------|------|
| Intent / draft submit | `dashboard/.../createStoreIntent.ts`, `storeCreationDraftSubmit.ts` |
| Draft SSOT | `core/.../lib/intake/storeCreationDraft.js` |
| Checkpoint dispatch | `core/.../lib/intake/createStoreCheckpointDispatch.js` |
| Build executor | `core/.../lib/toolExecutors/store/structured_store_build.js` |
| Job + generate | `core/.../services/draftStore/orchestraBuildStore.js`, `draftStoreService.js` |
| Classification lock | `core/.../services/draftStore/storeGenerationBusinessContext.js` |
| Catalog | `core/.../services/draftStore/buildCatalog.js` |
| Website sections | `core/.../services/draftStore/websiteSectionsGenerator.js` |
| Theme (dashboard) | `dashboard/.../lib/websiteTheme.ts` |
| Template sections | `core/.../services/draftStore/websiteTemplateFoundation.js` |
| BUE | `core/.../lib/businessUnderstanding/*` |
| Intake evidence | `core/.../lib/kernel/ingress/intakeEvidence.*` |
| Research | `core/.../lib/storeCreationResearch/*` |
| CTA | `core/.../lib/storeTransactionMode.js`, `ctaEngine/resolveStorefrontPrimaryCta.js` |
| Grounded flag | `core/.../config/features.js` → `ENABLE_GROUNDED_STORE_CREATION_V1` (**unused**) |

---

## Audit answers (required 1–10)

### 1. Where business type/category is inferred

- Form / OCR hint: `inferStoreCategoryFromHint` in `storeCreationDraft.js`
- OCR assemble: `storeCandidate.js`
- BSL + vertical + blueprint: `storeGenerationBusinessContext.js`, `BusinessSemanticClassifier.js`, `classifyBusinessType.js`, `verticalTaxonomy.js`, `industryBlueprintRegistry.js`
- BUE create-store projection: **name/artifact only** — category left empty (`createStoreBueProjection.js`)

### 2. Where generic fallback content enters

- About template: `websiteSectionsGenerator.mergeWebsiteIntoPreview` — “…dedicated to quality…”
- Fake reviews: same file (Alex M. / Jordan K.) unless professional
- USP: “Hand-picked products…” / industry blueprint copy
- Taglines: LLM `resolveContent` or QA autofix
- Classifier default: `product_retail` + “Add to cart”

### 3. Where theme/style is selected

- Website template slug → `websiteTemplateFoundation` colors/section order
- Adaptive heuristic by storeType regex when no template
- Dashboard `WebsiteThemeInput` (templateId / aiTheme / brandKit / storeBrandColors)
- **NO EVIDENCE FOUND** for a `themeSpec` contract name
- BUE `BrandProfile` colors **not** projected into create-store theme

### 4. Where images are selected

- Checkpoint logo/hero upload/library URL
- Item fill: Pexels via `fillMissingDraftItemImages.js`
- Hero stock fallback in QA autofix
- Optional website scrape when URL present
- URI / Universal Library: **not wired** into `structured_store_build` compose

### 5. Do uploaded images/OCR influence generation?

| Concern | Influence |
|---------|-----------|
| Identity (name, phone, email, address) | Yes |
| Category | Partial heuristics |
| Catalog | Partial (`ocr` / research modes); default is AI invent |
| About / tagline | Weak |
| Theme / palette | No closed loop |
| Logo | Yes if checkpoint |

### 6. Does web/discovery evidence influence generation?

- `runStoreCreationResearch` — yes when contact/web signals allow
- Discover rails / URI federation — **NO EVIDENCE FOUND** on create-store compose path

### 7. Where products/services are fabricated

- `buildCatalog` modes: `ai` | `template` | `seed` | `ocr`
- AI failure → template; seed expands to minimum item counts
- Placeholder scaffolds (“Express Service”, packages) — partially detected by QA, still generatable

### 8. Where generic CTA labels are introduced

- `classifyBusinessType.catalogProfileDefaults` (retail → Add to cart)
- Locked `storeGenerationBusinessContext.primaryCTA`
- `resolveStoreCommerce` / CTA Engine wrap
- Industry blueprint `ctaLabel`

### 9. Do templates assume retail/ecommerce?

**Yes as default.** Unknown → `product_retail`; retail subcategory labels; seed retail scaffolds; shopping USP language; template slugs like `retail-store-website`. Professional/food blueprints exist but lose when signals are weak.

### 10. Reusable infrastructure

| Asset | Reuse |
|-------|--------|
| Performer checkpoint / mission spine | REUSED_AS_IS |
| StoreCreationDraft + StoreCandidate | EXTEND |
| IntakeEvidenceBundle | EXTEND → generation EvidenceBundle |
| BUE CanonicalUnderstandingBundle / BrandProfile | EXTEND (enable carefully; project beyond name) |
| storeGenerationBusinessContext | EXTEND → BusinessUnderstanding |
| Industry blueprints + BSL | EXTEND → archetypes |
| Research catalog path | EXTEND (best grounded catalog today) |
| CTA engine + commerce SSOT | REUSED_AS_IS / EXTEND |
| Website theme + section foundation | EXTEND → ThemeSpec |
| URI / UL / rights | REUSED_AS_IS discovery; wire into compose later |
| Preview renderers | REUSED_AS_IS |
| ENABLE_GROUNDED_STORE_CREATION_V1 | Wire (currently MISSING enforcement) |

---

## Root failure mode

The system often produces **generic store shells** with business-specific **text inserted**, because:

1. Default generation invents catalogs (`draftMode: 'ai'`).
2. Weak category → retail ecommerce journey.
3. Brand visual evidence never drives ThemeSpec.
4. URI/resources are not part of composition queries.
5. Generic about/reviews/USP fill empty structure.
6. Grounded flag exists but has no consumers.

---

## Target composition flow (Phase 2+)

```
EvidenceBundle (OCR facts + visual inference + provenance)
        ↓
BusinessUnderstanding (model, journey, actions, confidence)
        ↓
BrandStyleProfile (colors, density, tone — separate from facts)
        ↓
StoreCompositionPlan (archetype, sections, CTAs, media strategy, ThemeSpec)
        ↓
Resource queries (URI) + relevance gate
        ↓
Grounded draft compose (flag-gated)
        ↓
Genericness / brand-match evaluation → repair
        ↓
Owner review (existing confirmation controls)
```

---

## Contracts introduced (Phase 1 — unwired)

Under `apps/core/cardbey-core/src/lib/storeGeneration/`:

| Module | Role |
|--------|------|
| `fieldStatus.js` | VERIFIED / INFERRED / SUGGESTED / GENERATED / UNKNOWN / USER_EDITED |
| `evidenceBundle.js` | Provenanced sources + facts + assets + visualSignals |
| `businessUnderstanding.js` | Normalized business model / journey / actions |
| `brandStyleProfile.js` | Visual identity (not facts) |
| `businessArchetypes.js` | Behavioural archetypes + section/CTA maps |
| `storeCompositionPlan.js` | Composition plan + ThemeSpec |
| `index.js` | Public exports |

These do **not** alter live generation until Phase 2 wires them behind `ENABLE_GROUNDED_STORE_CREATION_V1`.

---

## Provenance policy (locked for later phases)

- Every field carries `value`, `source`, `sourceType`, `confidence`, `status`.
- OCR FACTS ≠ VISUAL INFERENCE.
- SUGGESTED must never silently become VERIFIED.
- Regulated/professional claims: omit or require VERIFIED evidence.
- Priority for visuals: business-owned evidence → official public → strong inference → category default → Cardbey generic.

## Fallback policy

1. Verified business evidence  
2. Official/public evidence  
3. Strong category inference  
4. Industry blueprint defaults  
5. Generic Cardbey default (**last resort**)

## Resource-selection policy (Phase 3)

Query URI with business + purpose + tone + palette + negatives.  
Relevance gate rejects off-domain subjects. Prefer neutral placeholder over misleading media.

## Anti-generic gate (Phase 4)

Fail when the store could be renamed for an unrelated business without structural/visual change (`GENERATION_FAIL_GENERIC`). Repair before present.

---

## Migration / compatibility

- Existing published stores: **no silent restyle**.
- New generation / re-generation only, feature-gated.
- Persist generation metadata (understanding id, plan, evidence refs) when wired.

## Known limitations (now)

- No multimodal style→theme closed loop.
- No StoreCompositionPlan executor.
- No URI in create-store compose.
- No post-render brand-match evaluation.
- Multi-business visual pilot not run (Phase 5).

## Staging requirements (later)

- Enable `ENABLE_GROUNDED_STORE_CREATION_V1` on staging only.
- Fixtures: breakfast, noodle, finance, home service, beauty, retail.
- Screenshots + structure/CTA/media diffs vs control.

## Phasing

| Phase | Focus | Status |
|-------|--------|--------|
| 1 | Audit + contracts | **This deliverable** |
| 2 | Archetypes, CTA, sections, anti-generic | Not started |
| 3 | Multimodal brand + ThemeSpec + URI queries | Not started |
| 4 | Relevance + quality + repair | Not started |
| 5 | Multi-business pilot | Not started |
