# Impact Report — Store Creation Runway Accuracy Audit V2

**Date:** 2026-08-12  
**Scope:** Audit only (no implementation)  
**Codebase:** `C:\Projects\cardbey-wt-store-gen-p2` (Phase 2/3 present) + dashboard preview paths under `apps/dashboard/cardbey-marketing-dashboard`  
**Trigger example:** NOODLE hut (takeaway / Fairfield VIC card-style create) — pipeline completes but preview is not factually/visually grounded  

---

## 1. Executive verdict

**STORE_CREATION_RUNWAY_PARTIALLY_GROUNDED**

The runway **finishes** store creation, but completion ≠ correctness. For a NOODLE hut–class business, runtime authority still frequently collapses to:

| Domain | Typical result | Why |
|--------|----------------|-----|
| Category | `Other` / vertical `generic` | Intake + vertical classifiers omit `noodle`/`takeaway` |
| Menu | Invented or OCR-bucketed as Other | Grounded invent-stop **default OFF**; OCR path stamps `categoryId: 'other'` |
| Currency | **USD** in UI | Items often lack `currency`; preview renderer defaults `?? 'USD'` |
| Brand | Generic theme | Card colours/logo rarely survive into ThemeSpec without grounded flag |
| Hero | Unrelated stock | Phase 3 resource fulfillment **default OFF**; semantic media gate **unwired** |
| CTA | Weak / enquiry | Commerce re-resolves against weak `Other` type |

Phase 2/3 contracts exist and pilot tests prove the *intended* path — but **production/local defaults leave that path off**, so legacy invent + UI defaults win.

**No live persisted draft/mission IDs for a specific NOODLE hut run were available in this workspace** (no Fairfield draft logs). Forensic conclusions below are from **current runtime code paths** that a card → create-store journey must exercise, cross-checked against Phase 2 pilot fixtures for Noodle Hut.

---

## 2. Actual runtime architecture (today)

```text
Performer intake / card upload
  → OCR / attachment evidence (optional)
  → storeCreationDraft / inferStoreCategoryFromHint  ← often "Other"
  → (optional) store research pipeline (env-gated)
  → generateDraftTwoModes
       → [FLAG OFF] skip composeGroundedStoreIntelligence
       → resolveGenerationParams (mode often ai)
       → buildCatalog (AI / template / OCR→Other)
       → saveDraftBase
       → finalizeDraft
            → [FLAG OFF] skip Phase 3 resourceNeeds
            → Pexels / hero invent / seed library
            → mergeWebsiteIntoPreview (heuristic unless groundedComposition)
            → applyCommerceFieldsToPreview
  → Preview UI (StorePreviewPage currency ?? USD)
```

---

## 3. Intended architecture (Phase 2/3 when flags ON)

```text
EvidenceBundle
  → BusinessUnderstanding + archetype (e.g. FOOD_TAKEAWAY)
  → GroundedComposition (+ resourceNeeds, ThemeSpec, CTA)
  → evidence seed catalog (no invent)
  → GroundedResourceBundle (owner → Library → URI)
  → finalizeDraft assembly
  → grounded mergeWebsiteIntoPreview
```

**Gap:** Intended path is code-complete on branch `feat/resource-grounded-store-generation-phase3` but **not the default execution path**.

---

## 4. NOODLE hut forensic trace (code-path reconstruction)

| Artifact | Expected for card (Station St Fairfield VIC) | Observed authority without flags |
|----------|-----------------------------------------------|----------------------------------|
| conversationId / missionId / draftId | Runtime-specific | **Not captured in this audit workspace** |
| Attachment | Business card image | UI shows one attachment; intake canonicalize may still race |
| OCR | Name, hours, address, phone, logo colours | If present, often underused for category/currency |
| storeCandidate / research | Places + website | Weak if location not structured into research fields |
| EvidenceBundle / GroundedComposition | FOOD_TAKEAWAY, orange palette, Order Now | **Skipped** when `ENABLE_GROUNDED_STORE_CREATION_V1=false` |
| resourceNeeds / GroundedResourceBundle | Hero ≠ card scan; food media | **Skipped** when Phase 3 flag false |
| Catalog | Evidence menu lines | AI/template invent or OCR→Other |
| Currency | AUD | UI shows USD |
| Theme / CTA | Takeaway brand + Order | Generic + weak CTA |

Phase 2 pilot fixture (flag ON) for Noodle Hut proves the *correct* composition exists in tests (`FOOD_TAKEAWAY`, Order Now, orange `#E85D04`) — that is **not** what the default create-store path produces.

---

## 5. Evidence provenance (card fields)

Conceptual card content (from product description / prior sessions):

| Field | Typical card value | Source | Confidence if OCR works | Consumed downstream (default path)? |
|-------|-------------------|--------|-------------------------|-------------------------------------|
| businessName | NOODLE hut / Noodle Hut | OCR / upload | high | Partial (name yes; casing/normalization uneven) |
| logo / hut mark | orange logo | visual | medium | Often **no** — not ThemeSpec/hero authority |
| brand colours | orange + black | visual | medium | **Lost** unless `primaryColor` passed + grounded ON |
| phone | on card | OCR | high | Research/contact if stored; not brand |
| address | Station Street, Fairfield VIC | OCR | high | **Currency:** Fairfield alone ≠ AUD in infer list; needs VIC/Australia |
| hours | Mon–Sun block | OCR | high | Contact section if hours field set |
| category clues | noodle / takeaway visual | name + art | high for human | **Classifier miss** → Other |
| menu lines | may be absent on *card* | — | — | Empty offerings → invent |

---

## 6. Business identity audit

1. Logo evidence: extractable via vision/OCR pipeline in places; **not reliably persisted as storefront logo authority**.  
2. Final preview logo: often missing or replaced by avatar invent.  
3. Brand colours: Phase 2 `buildBrandFromInput` + takeaway palette **only when grounded composition runs**.  
4. Archetype palette can override empty colours (acceptable); **problem is composition never runs**.  
5. ThemeSpec → `mergeGroundedWebsiteIntoPreview` when composition present.  
6. Renderer / Design Library projection: separate from create-store; cutover flags do not fix invent path.  
7. Generic template styling wins when foundation + heuristic website path used.

**Why NOODLE hut does not “feel” like the card:** identity signals stop at intake/name; visual brand and takeaway archetype never become ThemeSpec/CTA/catalog authority on the default path.

---

## 7. Research / data-fetch audit

| Source | Attempted? | Matched? | Notes |
|--------|------------|----------|-------|
| Google Places | Conditionally | Only with location/phone/website signals | `shouldRunStoreCreationResearch*`; Places may be unconfigured |
| Official website | Conditionally | Rare for card-only | |
| GBP / directories | Conditionally | | |
| Menu pages / prices | Rare | | |
| Hours / media crawl | Rare | | |

`ENABLE_STORE_RESEARCH_PIPELINE`: non-prod often ON, but **card-only + category Other** yields weak matches → suggested/fallback catalog invent.

Exact failure for a given mission: requires mission logs (not present here). Structural risk: research is **advisory** unless catalog authority decision binds sourced items — and invent path still fills gaps.

---

## 8. Business reasoning / archetype audit

| Layer | NOODLE hut behaviour |
|-------|----------------------|
| `inferStoreCategoryFromHint` | Food regex: `cafe|coffee|restaurant|food|pizza|sushi|bakery|bar` — **no noodle/takeaway** → **`Other`** (`storeCreationDraft.js`) |
| `resolveVerticalSlug` | Food keywords omit noodle/takeaway → **`generic`** (`verticalResolver.js`) |
| Phase 2 `inferArchetypeFromHints` | **Does** match noodle/takeaway → `FOOD_TAKEAWAY` | Only if grounded flag ON |

**Where `Other` is introduced (definitive):**

1. **Intake category inference** (`inferStoreCategoryFromHint` → `'Other'`).  
2. **OCR catalog** (`buildFromOcr` → every `categoryId: 'other'`).  
3. **Preview normalizer** (`normalizePreviewCategories` always ensures Other bucket; reassigns invalid ids).

Phase 2 archetype cannot save the draft if it never runs.

---

## 9. Catalog / menu provenance

For items like Edamame / Gyoza / Pad Thai appearing in a “complete” preview:

| Likely origin (default path) | Classification |
|------------------------------|----------------|
| AI `generateVerticalLockedMenu` / expansion | **generated** |
| Template catalog after AI fail | **fallback** |
| Seed pad to hit min item count | **fallback** |
| OCR line dump (if menu photo) | **sourced** but all under category Other, often **no currencyCode** |
| Phase 2 evidence seed (flag ON) | **sourced** |

Without mission catalog meta (`catalogSource`, `origin`, `provenanceStatus`), UI **cannot distinguish** suggested vs sourced — and currently presents items as real menu.

**Invention risk:** High when card has no menu lines and grounded flag is OFF.

---

## 10. Price / currency audit

### Core inference (`currencyInfer.js`)

- AU states / Australia / major cities → **AUD**  
- Empty / Fairfield alone → **null**  
- Callers often default null → **AUD** in catalog build/commit  

### User-visible USD

Dashboard preview/cart:

```text
item.currency ?? 'USD'
priceCurrency ?? 'USD'
cart subtotals hardcoded 'USD'
```

(`StorePreviewPage.tsx` and related storefront mappers)

### Additional USD bias

- LLM menu parser few-shots use USD  
- Some legacy AI routes stamp USD  
- Menu extract heuristics can pick USD from price shape  

### Currency decision for Australian card

```text
currencySource:        often missing on items + UI default
currencyConfidence:    low
currencyFallbackReason: renderer ?? 'USD' (overrides core AUD intent)
```

**Prices:** If invent path, prices are **generated**. Safer policy when unverified: no price / “Price on request” — not currently enforced on invent path.

---

## 11. Brand-awareness audit

See §6. Summary: **no durable brand model** on default path — only optional fields + template colours. Phase 2 BrandStyleProfile is the intended model but flag-gated.

---

## 12. Resource / media audit

| Asset | Default path | Phase 3 (flags ON) |
|-------|--------------|--------------------|
| Hero | `generateHeroForDraft` / seed library / Pexels | `resourceNeeds.heroImageNeed` → owner > URI; **card scan rejected as hero** |
| Item images | Pexels / OpenAI fill | product/service needs |
| Semantic gate | `scoreSemanticMediaMatch` exists | **Only tested — not called from finalizeDraft** |

**Why generic hero wins:** Phase 3 off + no semantic reject of weak stock + OCR card deliberately not used as hero (correct) with no first-party substitute.

---

## 13. Design Library audit

- `ENABLE_DESIGN_LIBRARY_V1` often ON in non-prod.  
- Projection cutover is **presentation**, not catalog truth.  
- Demo/sample content must not leak: separate risk if acceptance not gated.  
- Does **not** fix invent/category/currency on create-store.

---

## 14. CTA audit

| Expected (takeaway) | Actual (Other / weak) |
|---------------------|------------------------|
| View menu / Order now | Contact business / enquiry-style |

Mechanism: `applyCommerceFieldsToPreview` uses grounded CTA if present; else `resolveStoreCommerce` on storeType. **`Other` → enquiry CTA.** Even food classifier may miss if `businessName` not in commerce corpus at call site.

---

## 15. Owner review / approval audit

Research / sourced catalog may stage **pending review** (`PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW`, non-prod default ON).  

Gaps:

- Preview still shows invent/suggested as if live truth.  
- Owner-confirmed facts are **not** a hard SSOT over AI invent on the default generate path.  
- Confirmed values can be overwritten by later invent/normalize steps (authority conflict).

---

## 16. Content Readiness audit

`contentReadinessModel.js` (restored with invent-stop) can mark incomplete offerings — **informational / grounded policy**, not a hard block on all create-store UIs. Readiness does not stop USD UI default or Other category on legacy path.

| Area | Typical for NOODLE hut default run |
|------|-------------------------------------|
| Identity | partial ready (name) |
| Branding | missing / suggested |
| Catalogue | suggested_only / generated |
| Media | weak / stock |
| Currency | missing stamps → UI USD |
| Location | may be present on card but unused for currency |

---

## 17. Legacy fallback trace

| Stage | Expected authority | Fallback used | User-visible? |
|-------|-------------------|---------------|---------------|
| Category | evidence / archetype | `inferStoreCategoryFromHint` → Other | Yes |
| Vertical | food takeaway | `generic` | Indirect |
| Catalog | OCR/evidence | AI → template → seed pad | Yes (fake menu) |
| OCR items | role categories | all `other` | Yes |
| Website | grounded sections | heuristic USP/reviews | Yes |
| Hero | business media | Pexels/seed | Yes |
| Currency | AUD | UI USD | Yes |
| CTA | Order | Contact business | Yes |
| Phase 2/3 | composition/resources | skipped (flag off) | Quality loss |

---

## 18. Authority map

| Domain | Intended authority | Actual runtime authority (default) | Gap |
|--------|-------------------|-------------------------------------|-----|
| Identity | accepted facts / OCR | name from intake; rest droppable | CONTEXT_LOSS |
| Category | business understanding | intake hint → Other | BUSINESS_REASONING_GAP |
| Menu | sourced catalog | AI/template invent | LEGACY_FALLBACK_OVERRIDE |
| Currency | region/source | UI `?? USD` | REGION_CURRENCY_GAP |
| Brand | ThemeSpec + source | template / defaults | BRAND_GROUNDING_GAP |
| Media | GroundedResourceBundle | Pexels/hero invent | RESOURCE_MATCHING_GAP |
| Layout | composition / projection | heuristic website | RENDERER_GAP / FLAG |
| CTA | commerce + archetype | Other → enquiry | AUTHORITY_CONFLICT |
| Preview | projection renderer | StorePreviewPage defaults | RENDERER_GAP |

---

## 19. Data-loss map

```text
Card: Fairfield VIC, Australia
  → OCR may extract VIC
  → if location not on draft.input.location → currencyInfer null
  → catalog may omit currencyCode on OCR items
  → StorePreviewPage item.currency ?? 'USD'
  → USER SEES USD

Card: NOODLE hut (takeaway)
  → inferStoreCategoryFromHint (no noodle) → Other
  → resolveVerticalSlug → generic
  → commerce / copy / images use weak vertical
  → USER SEES generic store

Card: orange brand
  → colours not forced into generation params
  → grounded composition OFF → no ThemeSpec
  → template/default colours
  → USER SEES non-brand storefront

Card: no menu lines
  → offerings empty
  → grounded OFF → AI invent Pad Thai etc.
  → presented as real menu
  → USER TRUST BROKEN
```

---

## 20. Invention map

Classification for a typical **flag-off, card-only** NOODLE hut run:

| Content class | Estimate |
|---------------|----------|
| Menu items | **Mostly generated/fallback** unless menu OCR |
| Prices | **Generated** or missing → UI invents currency |
| Images | **Stock/AI** |
| Descriptions / about | **Generated** |
| Business copy | **Generic template** |

Phase 2 pilot (flag ON + OCR menu) flips menu to **sourced** — proving invent is path-dependent, not inevitable.

---

## 21. Feature-flag matrix

| Flag | Default | Effect on accuracy |
|------|---------|-------------------|
| `ENABLE_GROUNDED_STORE_CREATION_V1` | **false** | OFF → no composition, invent-stop, evidence seed |
| `ENABLE_RESOURCE_GROUNDED_STORE_GENERATION_V1` | **false** | OFF → no GroundedResourceBundle in finalizeDraft |
| `ENABLE_STORE_RESEARCH_PIPELINE` | non-prod often ON | Research may run but not stop invent |
| `PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW` | non-prod ON | Staging review; preview still may show invent |
| `ENABLE_DESIGN_LIBRARY_V1` | non-prod often ON | Presentation, not truth |
| `ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1` | gated on DL | Renderer path |
| `ENABLE_UNIFIED_CARDBEY_ASSISTANT_V1` | Vite/staging dependent | Spine; attachments still via intake |

**Local can look “done” while production flags leave invent ON** — or the opposite. Grounded flags are the critical accuracy switch.

---

## 22. Test-coverage gaps

**Present:** Phase 2 six-business composition; Phase 3 resource unit tests (mocked URI); invent-stop unit tests; currencyInfer unit behaviour.

**Missing (priority):**

1. E2E: card → OCR → category ≠ Other for noodle/takeaway  
2. E2E: AU location → **AUD in preview UI** (not only core)  
3. E2E: no invent when offerings empty + grounded ON (incomplete OK)  
4. E2E: hero rejects weak stock when better owner/official media exists  
5. Journey: owner-approved facts cannot be overwritten by AI invent  
6. Cross-business matrix automated beyond composition unit tests  

---

## 23. Cross-business matrix (structural)

| Business | Identity | Category | Currency | Offerings | Media | Brand | CTA | Grounding risk |
|----------|----------|----------|----------|-----------|-------|-------|-----|----------------|
| Restaurant/takeaway (NOODLE) | name OK | **Other risk** | **USD UI** | invent risk | stock hero | weak | weak | **High** |
| Home service | medium | better regex | USD UI | invent packages risk | stock | weak | quote OK if type known | High |
| Beauty/booking | medium | salon match | USD UI | invent | stock | weak | book possible | Med |
| Retail | medium | retail match | USD UI | invent | stock | weak | shop | Med |
| Finance/professional | better after recent harden | finance match | USD UI | invent packages | trust stock | blue default | consult | Med |
| Sparse/new | name only | Other | USD UI | empty or invent | none/stock | none | contact | **High** |

---

## 24. Root-cause classification

| ID | Category | Files / modules | Runtime evidence | User impact | Recommended fix (do not implement now) | Dependency |
|----|----------|-----------------|------------------|-------------|----------------------------------------|------------|
| R1 | BUSINESS_REASONING_GAP | `storeCreationDraft.js` `inferStoreCategoryFromHint` | noodle≠food regex → Other | Wrong category | Add noodle/takeaway/asian QSR terms; share taxonomy with archetype | Shared classifier |
| R2 | BUSINESS_REASONING_GAP | `verticalResolver.js` | noodle → generic | Wrong vertical/images | Align food keywords with archetype | R1 |
| R3 | FEATURE_FLAG_GAP | `features.js` | grounded/resource default OFF | Invent path lives | Pilot: ON for create-store staging; measure | Ops |
| R4 | LEGACY_FALLBACK_OVERRIDE | `buildCatalog.js` | AI/template/seed when flag off | Fake menu | Invent-stop always for create-store OR force grounded | R3 |
| R5 | DATA_NORMALIZATION_GAP | `buildFromOcr` | all `categoryId: 'other'` | “Other” catalog | Role-aware OCR categories | Catalog authority |
| R6 | LEGACY_FALLBACK_OVERRIDE | `normalizePreviewCategories` | forces Other bucket | Flattens semantics | Honour sourced bypass always when meta says so | Sourced catalog |
| R7 | REGION_CURRENCY_GAP | `StorePreviewPage.tsx` et al. | `?? 'USD'` | Wrong currency | Default AUD for AU locale/store; never USD without signal | Locale SSOT |
| R8 | REGION_CURRENCY_GAP | `currencyInfer.js` | Fairfield alone null | Missed AUD | Suburb+VIC parsing; postcode AU | OCR location |
| R9 | RESOURCE_MATCHING_GAP | `finalizeDraft` | semantic gate unused | Unrelated hero | Wire `shouldAcceptMediaMatch`; prefer Phase 3 | R3 |
| R10 | BRAND_GROUNDING_GAP | composition / theme | colours unused | Generic look | Persist card colours → ThemeSpec always | Vision |
| R11 | AUTHORITY_CONFLICT | commerce preview | Other → Contact | Wrong CTA | Pass name+archetype into commerce; grounded CTA | R1 R3 |
| R12 | DATA_ACQUISITION_GAP | research pipeline | weak card-only | Thin facts | Places from address; website from OCR | Config |
| R13 | APPROVAL_PERSISTENCE_GAP | review staging | invent still shown | False trust | Preview labels suggested vs sourced | UI |
| R14 | TEST_COVERAGE_GAP | e2e missing | regressions return | Quality drift | Forensic NOODLE hut journey test | CI |

---

## 25. P0–P3 remediation plan (no implementation)

### P0 — correctness / trust

1. Stop presenting invent as fact: invent-stop or grounded ON for create-store staging.  
2. Fix preview currency default (AU → AUD; never USD without evidence).  
3. Fix noodle/takeaway → not Other (shared taxonomy).  
4. Stamp `currencyCode` on catalog items from location inference.  
5. Label suggested vs sourced in preview until approved.  
6. Reject unrelated hero when match score low (wire existing gate).

### P1 — business fidelity

1. Persist logo + brand colours into ThemeSpec.  
2. Enable Phase 3 resourceNeeds fulfillment in staging.  
3. Bind research sourced menu when Places/website hit.  
4. Commerce CTA from archetype + name.  
5. Owner-confirmed facts hard SSOT.

### P2 — presentation

1. Theme diversity from evidence.  
2. Layout by composition sections.  
3. Microcopy sanitization everywhere.

### P3 — optimization

1. Research depth / crawl.  
2. Media ranking quality.  
3. Cross-business automation matrix.

---

## Forensic E2E test definition (required next)

```text
business card (AU takeaway)
→ OCR
→ identity + VIC/AU location
→ category ≠ Other
→ currency AUD in preview payload AND UI
→ menu only if sourced; else incomplete (no invent)
→ brand colours/logo preserved when present
→ hero not generic when score < threshold
→ CTA Order / View menu
→ provenance fields on each item
```

---

## Answer to the primary question

**Where Cardbey stops representing the real business:**

1. **Category classifiers** turn “NOODLE hut” into **Other/generic** before understanding runs.  
2. **Grounded composition (Phase 2) is off by default**, so archetype/ThemeSpec/evidence catalog never become authority.  
3. **Catalog invent + OCR→Other** fill the storefront with non-sourced or poorly structured offerings.  
4. **Preview UI defaults currency to USD**, overriding AU-aware core defaults.  
5. **Media invent runs without the semantic reject gate / Phase 3 owner-first resolver**, so unrelated heroes ship.  
6. **Commerce CTA** re-derives from weak type → generic contact.

Completion of the pipeline only proves **orchestration succeeded**, not that **authority stayed with the business**.

---

## Verdict

**STORE_CREATION_RUNWAY_PARTIALLY_GROUNDED**

Not pilot-ready for accurate business representation until P0 items land and a NOODLE hut–class forensic E2E passes with provenance.
