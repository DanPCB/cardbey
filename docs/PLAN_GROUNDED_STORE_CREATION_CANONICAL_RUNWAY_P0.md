# Canonical-runway P0 patch plan — Grounded store creation (accuracy / trust)

**Date:** 2026-08-12  
**Status:** P0 implementation in progress on `feat/resource-grounded-store-generation-phase3` (core) + dashboard currency on main workspace tree  

**Implemented (this pass):**

| ID | Status |
|----|--------|
| P0-1 | Invent-stop for grounded AI with no evidence; policy unwrap fix; non-prod grounded default ON |
| P0-2 | Shared `foodVerticalLexicon` + intake/verticalResolver |
| P0-3 | currencyInfer suburbs; resolveGenerationParams AUD stamp; dashboard `itemPrice` + StorePreviewPage |
| P0-4 | OCR menu category (not Other); bypass helper restored |
| P0-5 | Semantic media gate wired in `finalizeDraft` hero/seed |
| P0-6 | Commerce FOODISH + businessName; food archetype overrides Other storeType |
| P0-7 | Partial — offeringIncomplete meta; full UI badge deferred |
| P0-8 | `p0NoodleHutForensic.test.js` + `itemPrice.p0.test.ts` |

**Note:** Worktree dashboard checkout is empty — UI currency patches live under `C:\Projects\cardbey\apps\dashboard\...` and must be merged onto the Phase 3 branch intentionally.  
**Basis:** `docs/IMPACT_REPORT_STORE_CREATION_RUNWAY_ACCURACY_AUDIT_V2.md`  
**Canonical path (unchanged):**

```text
intake / OCR
  → storeCreationDraft (category / location)
  → (optional) existing store research pipeline
  → generateDraftTwoModes
       → composeGroundedStoreIntelligence   [must actually run]
       → applyCompositionToGenerationParams
       → buildCatalog
       → saveDraftBase
       → finalizeDraft
            → resolveGroundedResources / media invent (gated)
            → mergeWebsiteIntoPreview
            → applyCommerceFieldsToPreview
  → StorePreviewPage / cart (currency + CTAs)
```

**Hard constraints**

- No new `ResearchAgent` / `GroundingAgent` / `CommerceAgent` / `CategoryAgent` / `StoreCreationOrchestrator`.
- No second store generator or truth model.
- Reuse Phase 2 (`storeGeneration/*`, `groundedStoreCreation.js`) and Phase 3 (`resolveGroundedResources`, `resourceNeeds`).
- Prefer incomplete + `needs_review` over invent-as-fact.
- High-impact publish paths stay behind existing safe-execution confirmation (out of scope for P0 accuracy patches).

---

## Goal (P0 only)

Make create-store **trustworthy** for businesses like NOODLE hut:

| Failure today | P0 outcome |
|---------------|------------|
| Invented menu presented as real | No invent (or invent blocked) when offerings empty / ungrounded |
| Category → Other | Noodle/takeaway/food clues → Food vertical, not Other |
| Preview shows USD | AU businesses show AUD; items stamped with currency |
| Weak / unrelated hero | Low semantic match rejected; empty/review preferred |
| CTA → Contact business | Food/takeaway → Order / View menu via existing commerce + composition |
| Grounded flags default OFF | Staging create-store path exercises grounded path |

Out of P0: new research agents, Design Library polish, Phase 3 full six-business screenshot gate, deep website crawl expansion.

---

## Patch set overview

| ID | Patch | Primary files | Risk |
|----|-------|---------------|------|
| P0-1 | Invent-stop / grounded path on for create-store staging | `features.js`, `draftStoreService.js`, invent-stop helpers | Medium — emptier catalogs |
| P0-2 | Shared category / vertical lexicon | `storeCreationDraft.js`, `verticalResolver.js`, archetype hints | Low |
| P0-3 | Currency authority (core stamp + UI default) | `currencyInfer.js`, `buildCatalog.js`, `StorePreviewPage.tsx` (+ cart) | Medium — UI-wide |
| P0-4 | OCR / preview Other sink | `buildCatalog.js` (`buildFromOcr`), `normalizePreviewCategories` | Low–med |
| P0-5 | Wire media semantic gate in finalizeDraft | `finalizeDraft` in `draftStoreService.js`, `groundedStoreCreation.js` | Low |
| P0-6 | CTA pass-through from composition / name | `applyCommerceFieldsToPreview`, commerce resolve call sites | Low |
| P0-7 | Suggested vs sourced labeling (preview/meta) | preview meta + minimal UI badge | Low |
| P0-8 | Forensic regression tests | core + dashboard tests | Low |

Implement **in this order**. Do not start with research integration.

---

## P0-1 — Stop invent-as-fact (authority)

### Intent

When create-store has no sourced offerings, do **not** fill a fake Pad Thai menu. Incomplete + review beats fiction.

### Smallest safe patch

1. For create-store staging (and local), set `ENABLE_GROUNDED_STORE_CREATION_V1=true` so `composeGroundedStoreIntelligence` runs inside `generateDraftTwoModes`.
2. Confirm invent-stop path in `groundedStoreCreation.js` / content readiness blocks AI/template seed when offerings empty or `inventStop: true`.
3. If invent still occurs with flag ON via a bypass in `buildCatalog`, close **only** that bypass for grounded composition present — do not rewrite catalog modes.

### Explicitly out of scope

- Rewriting `buildCatalog` mode dispatch.
- New “GroundingAgent”.

### Acceptance

- Sparse card (name + location, no menu OCR) → draft catalog empty or incomplete; meta shows invent blocked / needs offerings.
- Card with OCR menu lines → those lines only (or research-sourced later in P1), not AI expansion to hit min count.

### What could break

- Drafts that previously looked “full” become sparse → owner must add offerings. **Intended.**
- Template demos that relied on invent → use fixtures, not production invent.

---

## P0-2 — Category / vertical not Other

### Intent

One shared lexicon for intake + vertical + (existing) archetype hints. “NOODLE hut” / takeaway must not become `Other` / `generic`.

### Smallest safe patch

1. Extract or share food/takeaway keywords used by Phase 2 `inferArchetypeFromHints` (noodle, takeaway, asian, thai, etc.).
2. Update `inferStoreCategoryFromHint` in `storeCreationDraft.js` to return `Food & drink` (or existing canonicalize) for those terms.
3. Update `resolveVerticalSlug` in `verticalResolver.js` food branch with the same terms → `food`.
4. Keep display category names / vertical slugs as today’s SSOT — **do not** introduce `coffee_shop` / `finance_broker` new taxonomies.

### Acceptance

- Input name `NOODLE hut` + Fairfield VIC → category Food & drink, vertical `food` (even before research).
- Existing beauty/finance/construction cases unchanged (regression on Phase 2 pilot matrix).

### What could break

- Over-broad keywords (e.g. “bar” already present) — keep additions specific; add tests per keyword family.

---

## P0-3 — Currency = AUD for AU (core + UI)

### Intent

Never show USD as a silent default when store/locale is AU or location infers AUD.

### Smallest safe patch

1. Ensure `inferCurrencyFromLocationText` runs on draft location; expand only if needed (e.g. postcode / “Fairfield” + VIC already covered via VIC).
2. Stamp `currency` / `currencyCode` on every catalog item when store currency known (`buildCatalog` / normalize paths).
3. In dashboard `StorePreviewPage.tsx` (and cart subtotals / add-to-cart):
   - Resolve `storeCurrency` from preview/store locale once.
   - Replace `?? 'USD'` and hardcoded `'USD'` cart subtotals with `storeCurrency ?? inferred ?? 'AUD'` for Cardbey AU default **or** null → “—” / no price, never USD without US signal.
4. Prefer: **no US signal → not USD**. Platform default AUD is acceptable for Cardbey AU.

### Explicitly out of scope

- New CommerceAgent `detectCurrency`.
- Rewriting money formatting library.

### Acceptance

- AU location draft → all visible prices and cart subtotal AUD.
- Item without stamp still inherits store currency in UI (not USD).

### What could break

- Non-AU stores mistakenly AUD if location empty — mitigate: use store.locale / owner-confirmed currency when present; only then platform AUD.

---

## P0-4 — OCR / Other sink

### Intent

OCR lines must not all land as `categoryId: 'other'` when section/role evidence exists; preview normalizer must not flatten grounded/sourced semantics.

### Smallest safe patch

1. `buildFromOcr`: assign role categories when OCR/structure provides sections; if unknown, use a food/menu bucket when vertical is `food`, not global Other.
2. Confirm `shouldBypassLegacyCategoryNormalization` covers grounded/sourced previews; if create-store grounded meta missing, set the bypass flag when composition present.

### Acceptance

- OCR menu → items not all under UI category “Other”.
- Grounded composition preview keeps semantic categories.

---

## P0-5 — Wire semantic media gate

### Intent

Use existing `scoreSemanticMediaMatch` / `shouldAcceptMediaMatch` in `finalizeDraft` hero (and item image accept if cheap). No new MediaSelectionService.

### Smallest safe patch

1. Before applying Pexels/seed/hero invent URL, score candidate against business name / type / composition query.
2. If `!shouldAcceptMediaMatch(score)` → leave hero null / placeholder + `mediaRequiresReview: true` in meta.
3. Do not invent a different unrelated stock image as “fallback success”.

### Acceptance

- Weak stock hero rejected in unit/integration test.
- Strong food-relevant match still accepted.

### What could break

- More drafts without hero images → OK; Phase 3 / owner upload fills later (P1).

---

## P0-6 — CTA from composition / resolved type

### Intent

Takeaway/food → Order / View menu, not Contact business, when evidence supports food.

### Smallest safe patch

1. When `groundedComposition` / commerce policy CTA exists, `applyCommerceFieldsToPreview` must prefer it (verify call order).
2. Ensure commerce resolve receives `businessName` + resolved storeType/vertical (food), not bare Other.
3. No new category→CTA map file if archetype CTA already exists — wire it.

### Acceptance

- NOODLE hut–class after P0-2 → primary CTA Order or View menu.
- Finance still consultation/contact-style (pilot matrix).

---

## P0-7 — Suggested vs sourced (minimal trust UI)

### Intent

If any suggested/generated lines remain (flag edge cases), preview must not look identical to sourced truth.

### Smallest safe patch

1. Persist `catalogSource` / `provenanceStatus` / `origin` on items or preview.meta (already partial).
2. Dashboard: small “Suggested — confirm” badge when `origin !== sourced` or invent-stop incomplete.
3. Do not hide items silently.

### Acceptance

- Invented/suggested content visually distinguishable OR invent fully blocked (P0-1 makes badge rare).

---

## P0-8 — Forensic tests (contract, not new orchestrator)

### Required cases

1. **NOODLE hut** — name + VIC location → not Other; currency AUD in catalog + preview mapper; no invent when no menu; CTA food-appropriate when type food.
2. **Sparse AU business** — invent-stop; incomplete OK.
3. **Currency UI** — unit/mapper test: missing item.currency + store AUD → display AUD.
4. **Media gate** — weak match rejected (extend `groundedStoreCreation.test.js` + finalize integration if feasible).
5. **Regression** — existing Phase 2 pilot matrix + invent-stop tests still pass.

### Explicitly avoid

- New `StoreCreationOrchestrator` test suite with invented taxonomy slugs.

---

## Feature flags (P0 ops)

| Flag | P0 staging / local create-store | Notes |
|------|----------------------------------|-------|
| `ENABLE_GROUNDED_STORE_CREATION_V1` | **true** | Required for composition + invent-stop |
| `ENABLE_RESOURCE_GROUNDED_STORE_GENERATION_V1` | optional for P0 | Prefer ON after P0-5; not required to ship currency/category |
| `ENABLE_STORE_RESEARCH_PIPELINE` | leave as today | **P1** consumption into EvidenceBundle — not P0 start |
| Design Library / projection cutover | unchanged | Presentation only |

Document env in staging checklist; do not flip production until P0-8 green + one manual NOODLE hut preview.

---

## Explicitly deferred (P1+)

| Item | Why deferred |
|------|----------------|
| Deep research agent / SERP category invent | Authority conflict; use existing research → EvidenceBundle |
| Phase 3 full resourceNeeds staging matrix | Depends on P0 media gate + flags |
| Brand colour / logo ThemeSpec persistence | Fidelity, not false-fact P0 |
| Owner-confirmed hard SSOT over AI | Needs review UI contracts |
| Cross-business screenshot gate | Pilot readiness after P0 trust |

---

## Execution checklist (implementer)

1. [ ] Read audit V2 + this plan; confirm worktree branch with Phase 2/3.
2. [ ] P0-2 taxonomy (fast, low risk) + unit tests.
3. [ ] P0-3 currency stamp + StorePreviewPage/cart defaults.
4. [ ] P0-1 invent-stop / grounded flag staging + close bypasses.
5. [ ] P0-4 OCR/Other.
6. [ ] P0-5 media gate wire-up.
7. [ ] P0-6 CTA pass-through.
8. [ ] P0-7 suggested badge (if invent can still appear).
9. [ ] P0-8 forensic tests green.
10. [ ] Manual: one NOODLE hut–class create-store preview; attach draftId to notes.
11. [ ] Update audit verdict only when P0 acceptance met — no “pilot ready” from completion alone.

---

## Success criteria (P0)

| Metric | Pass |
|--------|------|
| Category for noodle/takeaway name | Not Other / not generic vertical |
| Currency in preview + cart (AU) | AUD |
| Empty offerings | No invented menu as fact |
| Weak hero | Rejected or review-flagged |
| CTA for food vertical | Order or View menu (not Contact-only) |
| New agents / orchestrators | **Zero** |
| Canonical pipeline entrypoints | Unchanged |

---

## Impact note (process change)

These patches change create-store **output quality and fullness** (sparser catalogs, fewer heroes, AUD UI). They do not change billing, publish, or customer messaging flows. Publish still requires existing confirmation governance.

**Smallest safe overall approach:** patch authority leaks on the existing runway; enable grounded composition for staging; do not build a multi-agent stack.
