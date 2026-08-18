# STORE_CREATION_STABILIZATION_AUDIT_V1

**Date:** 2026-08-12  
**Mode:** Forensic audit only — **no implementation**  
**Code authority:** `C:\Projects\cardbey-wt-store-gen-p2` (Phase 2/3 + P0 patches) + dashboard currency under `C:\Projects\cardbey\apps\dashboard\cardbey-marketing-dashboard`  
**Live missions observed:** `cmsppu5xw004ojva00c4k3rg1`, `cmspojnkj002ujv58fwjawle3` (pre-P0 symptoms), `cmspsueyd001gjvesyf4vrlpo9` (partial P0: Order Now + flavor copy; still Edamame invent)  
**Persisted draft dumps:** not available in workspace — fixture + screenshot + code provenance used for NOODLE hut

---

## VERDICT

**STORE_CREATION_RUNWAY_AUTHORITY_UNSTABLE**

The canonical runway (`generateDraftTwoModes` → composition → `buildCatalog` → `finalizeDraft` → website merge → commerce → preview) **can complete successfully while business truth is still contested by cuisine banks, AI invent, ungated item media, finalizeDraft leak repair, and heuristic website copy**.

P0 patches improved **category/CTA/website copy** when grounded composition runs (Order Now; “quality & flavor”). They did **not** make catalog/media authority continuous: **Edamame** is a **cuisine-bank fixture** (`food.asian`), not OCR evidence, and item images are **not** passed through `scoreSemanticMediaMatch`.

Completion ≠ grounding.

---

## 1. CANONICAL_RUNTIME_MAP

| Stage | FILE | FUNCTION | INPUT | OUTPUT | AUTHORITY READ | AUTHORITY WRITTEN | FALLBACKS | FLAGS | LEGACY | DATA LOSS |
|-------|------|----------|-------|--------|----------------|-------------------|-----------|-------|--------|-----------|
| Intake / NL / card | `lib/intake/storeCreationDraft.js` | `inferStoreCategoryFromHint`, draft builders | name, location, hint | category display | OCR/chat | category | → Other | — | yes | noodle historically → Other (mitigated by `foodVerticalLexicon`) |
| Vertical | `services/draftStore/verticalResolver.js` | `resolveVerticalSlug` | businessType, vertical | food\|generic\|… | name/type | verticalSlug | generic | — | yes | takeaway miss → generic |
| Params | `resolveGenerationParams.js` | `resolveGenerationParams` | draft.input | mode, currencyCode, vertical | location | currency AUD default | US→USD | — | — | location drop → still AUD |
| Evidence offerings | `lib/storeGeneration/buildGroundedComposition.js` | `collectEvidenceOfferings`, `extractOfferingLinesFromText` | ocr, seed, menu | string[] | OCR/seed | groundedOfferings | empty | Phase2 | — | weak lines dropped |
| Understanding / plan | same | `composeGroundedStoreIntelligence` | input+params | plan, brand, offerings, resourceNeeds, gate | evidence | groundedComposition | skip on error | `ENABLE_GROUNDED_STORE_CREATION_V1` | — | flag OFF = no plan |
| Apply plan | same | `applyCompositionToGenerationParams` | params, composition | CTA, colours, seedItems, mode seed | composition | params | food archetype overrides Other | Phase2 | — | AI→seed only if offerings exist |
| Catalog | `buildCatalog.js` | `buildCatalog` + builders | params | CatalogBuildResult | seed/OCR/AI/template | products | invent-stop empty; else AI/template/cuisine | Phase2 invent-stop | seed pad if !grounded | invent when OCR present but empty offerings |
| Invent-stop | `groundedStoreCreation.js` | `shouldSkipAiInventForGrounded`, `applyGroundedCatalogPolicy` | mode, evidence | empty or stripped | grounded | offeringIncomplete | strip Gift Voucher etc. | Phase2 | — | does **not** strip cuisine names like Edamame |
| Persist | `draftStoreService.js` | `saveDraftBase` | catalog | preview.items | catalog | preview | CTA resolve | — | normalize categories | prior catalog overwrite |
| Content LLM | `draftStoreService.js` | `runContentResolution` | profile | slogan/tagline | name/type | copy | LLM invent | grounded sanitize | — | invent copy w/ empty menu |
| Phase3 resources | `resolveGroundedResources.js` | `resolveResourceNeedsToBundle` | resourceNeeds | GroundedResourceBundle | needs | preview attach | Library/URI | `ENABLE_RESOURCE_…` default OFF | — | skipped |
| Finalize media | `draftStoreService.js` | `finalizeDraft` | preview | hero, item images | preview | media URLs | Pexels/seed/hero gen | Phase2 hero score only | seed hero | weak hero nulled; **items ungated** |
| Website | `websiteSectionsGenerator.js` | `mergeWebsiteIntoPreview` | preview, input | sections, CTA | composition? | website | heuristic “dedicated to quality” + fake USP/reviews | composition.archetype | heuristic | Other → “quality Other…” |
| Commerce | `draftStoreService.js` | `applyCommerceFieldsToPreview` | preview | CTA, modes | grounded CTA / FOODISH | ctaLabel | Contact/enquiry | — | resolveStoreCommerce | Other → weak CTA |
| **Leak re-entry** | `draftStoreService.js` | `finalizeDraft` → `repairServiceCatalogPlaceholderProducts` | items | possibly replaced items | leak profile | **new offerings** | cuisine/seed placeholders | **NOT grounded-gated** | **CRITICAL** | can re-invent after invent-stop |
| Categories | `normalizePreviewCategories` | same file | preview | Other sink | — | categoryId other | unless bypass | — | yes | flattens roles |
| Preview UI | dashboard `StorePreviewPage.tsx`, `itemPrice.ts` | render | preview | $ display | storeCurrency | — | AUD platform default | — | was USD | presentation vs stamp |

**Entry:** `generateDraft` → `USE_QUICK_START_TWO_MODES` → `generateDraftTwoModes` (`draftStoreService.js`).

---

## 2. AUTHORITY_LEDGER

| DOMAIN | SOURCE (intended) | FIRST WRITER | TRANSFORMERS | FINAL WRITER | RENDERER | OVERWRITE? | BY WHAT | SEV |
|--------|-------------------|--------------|--------------|--------------|----------|------------|---------|-----|
| business name | OCR/card | intake / OCR profile | casing | preview.storeName | website hero | rare | content LLM | L |
| business type / category | understanding | `inferStoreCategoryFromHint` / composition | verticalResolver, archetype | storeType, meta | tagline/about | **YES** | Other default; heuristic about | **P0** |
| vertical | type+name | `resolveVerticalSlug` | taxonomy | meta.verticalSlug | images/template | YES | generic | P0 |
| location | OCR | intake | research | input.location | about | drop | unused for media | P1 |
| currency | location/country | `currencyInfer` + `resolveGenerationParams` | buildCatalog stamp | item.currencyCode | itemPrice / preview | **YES (hist)** | UI `?? USD` (mitigated AUD) | P0 |
| offerings | OCR/research | evidence → seed OR AI OR **cuisine bank** | validators, leak repair | preview.items | menu UI | **YES** | cuisine/AI/finalize leak | **P0** |
| prices | source/OCR | cuisine bank / AI | — | item.price | $8.00 | invent | fixture prices | P0 |
| product media | resourceNeed | item image gen | **no semantic gate** | item.imageUrl | card | **YES** | stock mismatch | **P0** |
| hero | resourceNeed / gen | generateHeroForDraft | **scoreSemanticMediaMatch (hero only)** | heroImageUrl | website | YES | seed if reject empty | P1 |
| logo/brand | card | vision (weak) | ThemeSpec if composition | avatar/colours | hero overlay | YES | stock avatar | P1 |
| CTA | commerce policy | composition primaryCTA | applyCommerceFields | primaryCTA | button | YES | Other→Contact; food→Order Now | P0/P1 |
| website copy | composition or heuristic | mergeWebsite* | — | sections | preview | YES | “quality Other” heuristic | P0 |

**Competing authorities (explicit):**

1. **OCR / evidence offerings** vs **`foodCuisineCatalog` CUISINE_BANKS** vs **AI `generateVerticalLockedMenu`** vs **finalizeDraft leak repair**.  
2. **Grounded composition CTA** vs **`resolveStoreCommerce`**.  
3. **ThemeSpec / card brand** vs **hero invent / seed library**.  
4. **Core currency stamp** vs **dashboard presentation default** (historically USD; now AUD helper).

---

## 3. AUTHORITY_VIOLATIONS

**AUTHORITY_VIOLATION_1 — Cuisine bank masquerades as business menu**  
`foodCuisineCatalog.js` `CUISINE_BANKS['food.asian'].items[0]` = `{ name: 'Edamame', description: 'Steamed soybeans with sea salt.', price: '$8.00' }`  
Exact match to NOODLE hut preview line. Classification: **GENERATED_FALLBACK / fixture**, not SOURCED. Inserted via template / seed / leak-repair / `buildCuisineMenuCatalog` / `seedCatalogBuilder` / `templateItemsData.food_asian`.

**AUTHORITY_VIOLATION_2 — Invent-stop does not strip cuisine fixtures**  
`applyGroundedCatalogPolicy` / `stripInventedGenericProducts` only remove names like Gift Voucher / Consultation — **not** Edamame / Pad Thai. Cuisine invent survives “grounded” policy.

**AUTHORITY_VIOLATION_3 — Invent-stop bypass when OCR/photo present**  
`shouldSkipAiInventForGrounded`: if `ocrRawText` or `photoDataUrl` set (business **card** counts), invent-stop returns **false** even when no menu lines extracted → AI or downstream banks fill a fake menu.

**AUTHORITY_VIOLATION_4 — finalizeDraft leak repair not grounded-gated**  
After invent-stop catalog, `repairServiceCatalogPlaceholderProducts(..., () => buildServiceCatalogPlaceholderSeed)` can **re-insert** offerings (`draftStoreService.js` finalizeDraft ~1745–1775).

**AUTHORITY_VIOLATION_5 — Item media ungated**  
`scoreSemanticMediaMatch` runs for **hero/seed-hero only**. Item fill attaches stock (noodle box → Edamame) with no reject / `needs_media`.

**AUTHORITY_VIOLATION_6 — Heuristic website when composition missing**  
`mergeWebsiteIntoPreview` without `composition.archetype`:  
`` `${storeName} is a ${storeType} dedicated to quality...` `` → visible **“quality Other”** when storeType=Other.

**AUTHORITY_VIOLATION_7 — Production flag profile ≠ local**  
Grounded default ON non-prod, OFF production; Phase 3 resource default always OFF → **multiple incompatible products**.

**AUTHORITY_VIOLATION_8 — Mission success ≠ grounding success**  
Inspector “Completed” with no STORE_CREATION_AUTHORITY_TRACE / grounding PASS gate.

---

## 4. NOODLE_HUT_TRACE

**Fixture (from card + intake contract — no invented business facts):**

```text
name: NOODLE hut
location: Station Street / Fairfield / VIC 3078 (AU)
signals: takeaway / dine-in on card; orange brand mark
menu lines on card: none verified in workspace dumps
```

| Boundary | Value | Source | Confidence | Provenance | Authority |
|----------|-------|--------|------------|------------|-----------|
| Name | NOODLE hut | OCR/card | high | EXTRACTED | SOURCE |
| Location | VIC 3078 | OCR | high | EXTRACTED | SOURCE |
| Category (hist) | Other | intake miss | — | FALLBACK | violation |
| Category (P0 path) | Food & drink / FOOD_TAKEAWAY | lexicon + archetype | med | INFERRED | HIGH_INFERENCE |
| CTA (hist) | Contact business | Other commerce | — | FALLBACK | violation |
| CTA (recent) | Order Now | composition / FOODISH | med | DERIVED | OK if type food |
| Copy (hist) | quality Other… | heuristic website | — | FALLBACK | violation |
| Copy (recent) | quality & flavor… | grounded / sanitized | med | DERIVED | better |
| Hero (hist) | office | stock | low | STOCK | violation |
| Hero (recent) | cafeteria interior | stock/gen | low–med | STOCK | questionable |
| **Edamame** | name+desc+$8 | **`food.asian` cuisine bank** | n/a | **GENERATED_FALLBACK** | **violation** |
| Edamame image | noodle takeout | item image gen | ungated | STOCK | **mismatch** |
| Menu count | 1 item in UI | collapse / strip / filter / bank slice | — | — | incomplete truth |

**Why each menu item?**  
For the classic multi-item Thai menu (Edamame, Gyoza, Pad Thai…): **cuisine bank `food.asian`** (and/or AI prompted toward Asian), not OCR.

**Where did Edamame come from?**  
**Fixture:** `foodCuisineCatalog.js` → `food.asian` starters. Exact description string match.  
Not OCR. Not owner-confirmed. Not research-sourced.

**Why that image on Edamame?**  
Item image pipeline without semantic score; food-ish stock attached by name/query heuristics → noodle box wins over edamame semantics. Rejection logic **not executed** for items.

**Why only one item?**  
Plausible code paths (needs draft dump to confirm which):  
(a) invent-stop / policy emptied most then leak/cuisine re-injected one;  
(b) UI “Recommended” filter / catalog mode showing subset;  
(c) coherence/QA truncated;  
(d) grounded empty then single seed repair.  
**Authority issue:** whatever remains is still **not card-sourced**.

**Hero selection:** Not owner card logo as hero (correct); stock/gen food interior — Library/URI Phase 3 typically **OFF**, so not GroundedResourceBundle-first.

---

## 5. RESOURCE_MATCH_TRACE

```text
resourceNeeds (Phase 2 composition)
  → resolveGroundedResources (Phase 3) [DEFAULT OFF]
  → else finalizeDraft:
       generateHeroForDraft → scoreSemanticMediaMatch → accept/reject
       getSeedImageForCategory → score again
       item loop: generateImageForDraftItem [NO scoreSemanticMediaMatch]
```

| Selected resource class | Gate | Score dumped to meta? |
|-------------------------|------|------------------------|
| Hero | yes | mediaMatchScore / mediaRejectScore |
| Seed hero | yes | reject reason |
| Item images | **NO** | no |
| Phase 3 bundle | optional | when flag ON; still no shared item semantic gate |

**Deliberate mismatch tests (required, currently fail-open for items):**  
Edamame→noodle box, Plumbing→salon, etc. — **must reject**; today items accept.

**Fail-closed preference:** `needs_media` > wrong stock.

---

## 6. CATALOG_PROVENANCE_TRACE

| Insertion point | Classification |
|-----------------|----------------|
| OCR `buildFromOcr` | SOURCED / EXTRACTED (if real lines) |
| `buildCatalogFromGroundedOfferings` | SOURCED (evidence) |
| `generateVerticalLockedMenu` | GENERATED |
| `foodCuisineCatalog` / `templateItemsData.food_asian` | **GENERATED_FALLBACK** |
| `buildSeedCatalog` | FALLBACK |
| `validateAndCorrect*` rebuild | FALLBACK |
| `repairServiceCatalogPlaceholderProducts` (buildCatalog if !grounded; **finalize always**) | FALLBACK / invent |
| AI expansion variations | GENERATED |

**Provenance survival:** partial (`origin`, `catalogSource`, `offeringIncomplete`) — **UI does not require provenance badge**; cuisine items look like real menu.

---

## 7. CURRENCY_TRACE

```text
location VIC 3078
  → currencyInfer → AUD
  → resolveGenerationParams currencyCode AUD (platform default)
  → buildCatalog stamps currencyCode
  → preview items
  → dashboard resolveStorefrontCurrency / PLATFORM_DEFAULT_CURRENCY=AUD
  → cart uses storeCurrency
```

**Historical violation:** `?? 'USD'` / `getItemPrice` default USD (mitigated in dashboard submodule).  
**Invariant still fragile if:** stamps missing AND UI regresses to USD OR US false-positive.

`$8.00` display alone does not prove USD — AUD also uses `$`. Authority must be **code + currencyCode**, not glyph.

---

## 8. BRAND_TRACE

```text
card orange logo
  → OCR/vision (weak persist)
  → ThemeSpec only if composition runs
  → avatar often stock food crop
  → hero stock cafeteria
  → preview looks “generic restaurant”
```

**BUSINESS IDENTITY** (name, card mark, orange) ≠ **DESIGN STYLE** (stock cafeteria). URI/Library must not redefine identity; Phase 3 OFF → stock fills identity slots.

---

## 9. STORE_CREATION_FALLBACK_REGISTRY

| Location | Trigger | Output | User-visible | Labelled? | Overwrites evidence? | Class |
|----------|---------|--------|--------------|-----------|----------------------|-------|
| `inferStoreCategoryFromHint` → Other | no keyword | Other | yes | no | yes | **GROUNDING_VIOLATION** |
| `food.asian` Edamame bank | food/asian path | fake menu | yes | no | yes | **GROUNDING_VIOLATION** |
| `buildFromAi` menu | AI mode | invented dishes | yes | no | yes | **GROUNDING_VIOLATION** |
| invent-stop empty | grounded+no evidence | empty + needs_input | sparse | meta only | no | SAFE |
| stripInventedGeneric only | Gift Voucher etc. | remove scaffolds | — | — | — | SAFE incomplete |
| seed pad | !grounded, short catalog | pad items | yes | no | yes | **GROUNDING_VIOLATION** |
| finalizeDraft leak repair | placeholders | cuisine/seed | yes | no | **yes** | **GROUNDING_VIOLATION** |
| heuristic website | no composition | quality Other / fake reviews | yes | no | yes | **GROUNDING_VIOLATION** |
| hero seed | gen fail/reject | stock | yes | no | maybe | QUESTIONABLE |
| item image stock | always | mismatch | yes | no | yes | **GROUNDING_VIOLATION** |
| currency AUD platform | no signal | AUD | yes | — | — | SAFE for Cardbey AU |
| currency USD UI (old) | missing stamp | USD | yes | no | yes | **GROUNDING_VIOLATION** |
| Contact business CTA | Other | weak CTA | yes | no | yes | QUESTIONABLE→violation |
| normalize Other category | invalid ids | Other | yes | no | yes | QUESTIONABLE |

---

## 10. FLAG_MATRIX

| Flag | LOCAL (worktree P0) | STAGING (typical) | PRODUCTION default | Effect |
|------|---------------------|-------------------|--------------------|--------|
| `ENABLE_GROUNDED_STORE_CREATION_V1` | ON (non-prod default) | often unset→ON if NODE_ENV≠production | **OFF** | invent-stop, composition, policy |
| `ENABLE_RESOURCE_GROUNDED_STORE_GENERATION_V1` | may be forced true in agent start | OFF | OFF | resourceNeeds fulfillment |
| Research pipeline | env | env | gated | advisory unless bound |
| Design Library / projection | non-prod often ON | ON | gated | presentation, not catalog truth |

**Profiles (recommend ≤3):**

1. **PRODUCTION_SAFE** — grounded ON for create-store; invent-stop fail-closed; Phase 3 optional; no cuisine invent as fact.  
2. **STAGING_GROUNDED** — Phase 2+3 ON; authority trace required.  
3. **FULL_PILOT** — + research binding + owner review hard SSOT.

Today: local ≈ staging-ish grounded; production ≈ **legacy invent product** unless env set → **two products**.

---

## 11. EXECUTION SUCCESS VS GROUNDING SUCCESS

Mission “Completed” does not emit a grounding verdict.

**Required observable: STORE_CREATION_AUTHORITY_TRACE** (shape example)

```text
Identity       SOURCE_CONFIRMED (NOODLE hut)
Category       INFERRED_HIGH / FOOD_TAKEAWAY   | or FAIL if Other
Location       SOURCE_CONFIRMED / AU / VIC
Currency       DERIVED / AUD
Offerings      N sourced / M invented / cuisine_bank=K
Prices         sourced|unknown|fixture
Logo           SOURCE|MISSING
Hero           STOCK|LIBRARY|OWNER + score
Product media  accepted|needs_media + scores
CTA            ORDER_NOW|CONTACT + reason
Fallbacks      count + ids
Grounding      PASS|FAIL
```

Ship as structured log + draft.meta; gate “ready” on FAIL for P0 invent.

---

## 12. TEST_GAPS

**Present:** composition pilot matrix; invent-stop unit; media score unit; p0 forensic (lexicon/currency/invent helper); cuisine bank unit tests (prove bank exists — not that it must not ship as truth).

**Missing (golden journeys):**

| Journey | Must fail if |
|---------|----------------|
| A. AU restaurant card | Other / USD / Contact-only / cuisine Edamame without OCR |
| B. Menu photo takeaway | offerings not matching OCR lines |
| C. Home service card | food cuisine bank appears |
| D. Salon prompt | food CTA/menu |
| E. Retail website | invent packages as sourced |
| F. Sparse business | full fake menu presented as real |

**E2E must assert:** identity, category, location, currency, catalog provenance, CTA, brand, **item** semantic media, renderer strings (“Other” forbidden when food inferred).

---

## 13. LEGACY_REENTRY_MAP

| NEW AUTHORITY | LEGACY REENTRY | PROPERTY LOST/OVERWRITTEN | USER IMPACT |
|---------------|----------------|---------------------------|-------------|
| Grounded empty catalog | finalizeDraft leak repair | empty → cuisine/seed items | Fake Edamame |
| Evidence offerings | AI if OCR blob present | evidence ignored for invent-stop | Fake full menu |
| Composition CTA | commerce re-resolve if meta lost | Order→Contact | Wrong CTA |
| Food archetype | heuristic website if composition missing | flavor→Other copy | “quality Other” |
| Hero reject | seed library | null→unrelated stock | Wrong hero |
| Invent-stop | cuisine bank / template asian | incomplete→fixture menu | Invent-as-fact |
| Currency stamps | UI USD (hist) | AUD→USD | Trust break |
| Sourced categories | normalizePreviewCategories | roles→Other | Other sink |

---

## 14. TOP_ROOT_CAUSES

1. **Cuisine / template / seed banks inject fictional menus** (`foodCuisineCatalog` Edamame) presented as real — highest-confidence explanation for NOODLE hut items.  
2. **Invent-stop is incomplete** (OCR bypass; does not strip cuisine names; finalizeDraft leak repair re-enters).  
3. **Item media has no semantic accept/reject** — mismatches ship.  
4. **Heuristic website + Other category** rewrite identity copy/CTA when composition absent.  
5. **Flag/profile split** — production can run invent product while local runs grounded; success metrics ignore grounding.

---

## 15. P0 / P1 / P2

### P0 — factual correctness / invent / overwrite
- Fail-closed: no cuisine/AI/template offerings without SOURCED/INFERRED-high evidence; label or omit.  
- Gate finalizeDraft leak repair when grounded / inventStop.  
- Invent-stop: card OCR ≠ menu OCR; skip AI invent when no offering lines.  
- Strip or ban cuisine-bank names from “ready” preview unless provenance=fixture labelled.  
- Item media: wire `shouldAcceptMediaMatch` or `needs_media`.  
- Authority trace + grounding FAIL blocks “ready” for invent.  
- Production create-store: grounded ON (or equivalent invent-stop always).

### P1 — semantic quality
- Phase 3 resourceNeeds for hero/items.  
- Brand/logo ThemeSpec persistence.  
- Research → EvidenceBundle binding.  
- Menu completeness from real sources only.

### P2 — presentation
- Theme polish, chip copy (“Frequently Booked” on takeaway), layout diversity.

---

## 16. MINIMUM_STABILIZATION_SEQUENCE

1. **Authority trace** on draft.meta (observe before more invent).  
2. **Fail-closed cuisine/AI insert** when `groundedOfferings.length===0` and no menu OCR (empty + needs_input).  
3. **Disable finalizeDraft catalog invent** when grounded.  
4. **Item semantic media gate** + needs_media.  
5. **Golden journey A** (NOODLE hut card) red→green.  
6. Align **PRODUCTION_SAFE** flags with invent-stop.  
7. Only then deepen Phase 3 / research.

**Do not** add another Business Understanding / Research Agent / parallel generator.

---

## 17. STOP CONDITION ANSWERS

### 1. Top 5 root causes
1. Cuisine-bank / template invent (`Edamame` exact).  
2. Incomplete invent-stop + finalize leak re-entry.  
3. Ungated item media.  
4. Heuristic website / Other identity rewrite.  
5. Dual flag profiles (local grounded vs prod invent).

### 2. Subsystem that owns each fix
1. `foodCuisineCatalog.js` / `buildCatalog.js` / `templateItemsData.js` — catalog authority.  
2. `groundedStoreCreation.js` + `finalizeDraft` in `draftStoreService.js`.  
3. `finalizeDraft` item image loop + `scoreSemanticMediaMatch`.  
4. `websiteSectionsGenerator.js` + intake category / composition stamp.  
5. `features.js` + deploy env — single create-store profile.

### 3. Legacy paths to retire (or fail-closed)
- Shipping `CUISINE_BANKS` / asian template as unlabelled live menu.  
- finalizeDraft `repairServiceCatalogPlaceholderProducts` invent under grounded.  
- Heuristic “dedicated to quality” website when composition exists or should exist.  
- Presentation-level USD default (keep retired).  
- Mission complete without grounding PASS for invent-heavy drafts.

### 4. Fallbacks that should become fail-closed
- Empty evidence → **no** AI/cuisine menu (incomplete OK).  
- Semantic media fail → **needs_media**, not wrong stock.  
- Unknown category → clarify / Food if name evidence, not silent Other+Contact.  
- Missing currency stamp → store AUD for AU, never silent USD.

### 5. Smallest safe implementation sequence
See §16 — observe trace → fail-closed empty offerings → gate finalize invent → item media gate → golden NOODLE hut → prod flag align.

---

## STORE_CREATION_STABILIZATION_AUDIT_COMPLETE

Awaiting:

**ACKNOWLEDGED — PROCEED WITH STORE CREATION STABILIZATION**
