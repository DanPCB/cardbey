# Impact Report: Grounded Store Creation V1

**Status:** Phases 1–6 implemented (flag default **off** — do not enable in production until staging soak)  
**Flag:** `ENABLE_GROUNDED_STORE_CREATION_V1` (default **off**); optional `GROUNDED_MIN_MEDIA_MATCH_SCORE` (default `0.55`)  
**Date:** 2026-08-02  
**Rule:** A smaller but accurate store is better than a complete-looking store with invented content.

**Architecture split:** Grounded Store Creation owns **business truth**. Design Library owns **presentation**.

---

## 1. Observed failure (signage example)

A signage storefront was generated with:

- Generic / unrelated hero and product imagery
- Invented commerce items: Gift Voucher, Loyalty Discount, Package Deal, Consultation
- Categories/products not grounded in verified source data

UI rendered successfully; the store misrepresented the business. This is a **data-grounding and projection** failure, not a visual bug.

---

## 2. End-to-end creation flow (actual path)

```
Dashboard intake (storeCreationDraftSubmit.ts)
  → createStoreCheckpointDispatch.js (handoff + OCR/BUE/upload)
  → Mission + structured_store_build checkpoint
  → orchestraBuildStore.js (DraftStore + task)
  → storeContactIntake / preloadedCatalogItems
  → generateDraft() / draftStoreService.js
       ├─ research path: businessResearchAgent / runStoreResearchPipeline
       │                 → researchBackedStoreBuilder / researchCatalogDraft
       └─ catalog path: buildCatalog.js
            ├─ template (buildFromTemplate)
            ├─ AI (buildFromAi + expansion)
            ├─ OCR (buildFromOcr)
            └─ seed pad / leak “repair” (still invents replacements)
  → media fill (menuVisualAgent, heroGenerationService, Seed Library)
  → draft status ready
  → Publish fork:
       A) Mission auto: safePublishGeneratedDraft → commitDraft (legacy)
       B) UI: publishDraftService + publishSnapshot + projection hooks
  → Public render: storefrontRoutes / publicStoreMapper / publishedBusinessArtifactToPublicStore
```

**Important:** Generation is fairly unified; **publish is not**. Mission auto-publish still uses legacy `commitDraft()`. Field lineage to the live store depends on which publish leg ran.

---

## 3. Field ownership (who sets what)

| Field | Primary writers |
|-------|-----------------|
| Business name | `storeCreationDraft.js`, `createStoreCheckpointDispatch.js` → `preview.storeName` |
| Tagline / description | `draftStoreService` content resolution; research via `businessFactsExtractor`; website heuristic `websiteSectionsGenerator` |
| Categories / products / services | `buildCatalog.js` (template/AI/OCR/seed), `preloadedCatalogFromItems`, `researchBackedStoreBuilder` / `serviceMenuExtractor` |
| Prices | Template/OCR/research extractors; research suggested path clears invented prices; AI expansion often `price: null` |
| Product images | Start null → `fillMissingDraftItemImages` / `menuVisualAgent` (Pexels/stock) / Seed Library |
| Hero media | `storeContactIntake` (imported) → `heroGenerationService` → Seed Library → first product image on publish |
| Contact / address | `storeContactIntake`, handoff in `createStoreCheckpointDispatch`, publish merge in `publishDraftService` |
| Social / hours | `businessFactsExtractor` → research profile; website heuristic hours fallback |
| CTA | `draftStoreService` preview shaping, `websiteSectionsGenerator`, publish settings |

---

## 4. Root cause: silent catalog invention

Exact strings from the bug report are hardcoded and injected when catalogs are sparse or AI fails:

| Location | Behavior |
|----------|----------|
| `buildCatalog.js` `GENERIC_EXPANSION_FALLBACK` (~L160–166) | Consultation, Custom Quote, Express Service, Package Deal, Gift Voucher, Loyalty Discount |
| `buildCatalog.js` `buildFromAi` (~L563–599) | Pads AI menus with those variations |
| `buildCatalog.js` `buildCatalog` (~L739–769) | Pads short catalogs with seed items |
| `buildCatalog.js` (~L716–734) | AI failure → template catalog |
| `templateItemsData.js` `generic_store` | Consultation, Gift Voucher, Service 1… |
| `structuredTemplates.js` `TEMPLATE_SERVICES_GENERIC` | Standard/Premium Service, Custom Quote… |
| `seedCatalogBuilder.js` / `smeSeedBuilder.js` | Service seed invention |
| `serviceCatalogPlaceholders.js` | Detects placeholders then **replaces with other invented seed items** |
| `publicStoreMapper.js` / projection | Runs placeholder “repair” on public read |

**Media mismatch:** Missing images are filled via Pexels/Seed Library keyed by weak vertical/name heuristics (`menuVisualAgent`, `heroGenerationService`, `getSeedImageForCategory`), with no semantic match score gate — so empty cards get unrelated stock.

**Presentation mode gap:** No `BusinessPresentationMode` (`service_business` / `portfolio` / `lead_generation`). Signage tends to fall into generic service/retail catalog projection.

---

## 5. What already exists (reuse, don’t duplicate)

| Capability | Location | Gap vs requirements |
|------------|----------|---------------------|
| Research provenance | `storeResearch/provenancePersistence.js` | Mission-level, not every draft field |
| Owner review publish gate | `storeResearchPublishGate.js` | Not applied to all inventing paths / legacy commit |
| Research clears invented prices | `researchCatalogDraft.js` | Only research suggested path |
| Store readiness V1 | `storeReadiness/*` | Post-store seller readiness, not pre-projection create gate |
| Typed catalog / semantic QA flags | `features.typedCatalog` | Does not stop expansion fallbacks |
| Placeholder regex | `serviceCatalogPlaceholders.js` | Replaces with seeds instead of incomplete state |

**No** `ENABLE_GROUNDED_STORE_CREATION_V1` exists yet.

---

## 6. Impact of changing behavior

### What could break

1. **Sparse AI catalogs** no longer auto-pad to `CATALOG_ITEM_MIN` → drafts may show fewer items or empty offering section.
2. **AI→template fallback** disabled under flag → some missions get `needs_input` instead of a full fake catalog.
3. **Seed padding / leak repair** under flag → public “repair” may leave empty slots instead of replacing names.
4. **Stock image backfill** tightened → more `needs_media` / neutral placeholders; visually emptier cards.
5. **Auto-publish / ready status** may become `needs_review` more often if validation fails closed.
6. **Existing published stores** must remain unchanged (flag only on new/regenerated drafts).

### Why

Current pipeline optimizes for “looks complete.” Grounding rules optimize for “only show what we can defend.”

### Impact scope

- Core: `buildCatalog.js`, seeds/templates (gated), media fill, draft readiness meta, publish validation, research presentation mode
- Dashboard (later phases): owner review of verified vs suggested vs missing
- Public mappers: stop inventing replacements when flag on for *new* drafts only
- Existing live stores: **out of scope** unless owner regenerates

---

## 7. Smallest safe patch (phased)

### Phase 1 — Stop silent product invention (this confirmation gate)

**Files (≤5):**

1. `apps/core/cardbey-core/src/config/features.js` — add `ENABLE_GROUNDED_STORE_CREATION_V1` (default off)
2. `apps/core/cardbey-core/src/services/draftStore/groundedStoreCreation.js` — new: incomplete offering state, invented-name denylist, readiness stub, diagnostics builder
3. `apps/core/cardbey-core/src/services/draftStore/buildCatalog.js` — when flag on: skip AI expansion, seed pad, and AI→template invent path; emit `offeringIncomplete` meta + empty/sourced-only products
4. `apps/core/cardbey-core/src/services/draftStore/groundedStoreCreation.test.js` — no verified products; denylist not injected; signage path does not get vouchers
5. `docs/IMPACT_REPORT_GROUNDED_STORE_CREATION_V1.md` — this report

**Behavior when flag ON:**

- Do not insert `GENERIC_EXPANSION_FALLBACK` / seed pad / invented template fill for sparse catalogs
- If no verified/preloaded/OCR/research products: return structured incomplete state (`status: needs_input`, `reason: NO_VERIFIED_PRODUCTS_OR_SERVICES`)
- Keep identity/contact/hero from real intake when present
- Log structured diagnostics object

**Behavior when flag OFF:** unchanged (rollback = unset/false).

### Phase 2 — Media grounding gate

- Min match score before assign; reject weak Pexels/Seed matches
- Hero priority: verified banner → work/project → logo-led → neutral branded placeholder
- Diagnostics: acceptedMedia / rejectedMedia

### Phase 3 — Field provenance + fact/suggestion/placeholder separation

- Attach `FieldProvenance` on draft products/categories/media
- Never merge suggested into published inventory without approval

### Phase 4 — Presentation mode + pre-projection readiness

- `BusinessPresentationMode` (service_business / portfolio / lead_generation for signage)
- `StoreCreationReadiness` before projection

### Phase 5 — Publish fail-closed validators

- `assertNoInventedProducts`, `assertNoUntraceableMedia`, etc. on new-draft publish when flag on
- Do not change legacy `commitDraft` for old stores

### Phase 6 — Owner review UI + admin diagnostics panel

- Imported / Suggested / Missing / Needs confirmation
- Approve / Edit / Remove / Replace image / Mark not offered
- Dev + optional admin inspection of creation-run diagnostics

---

## 8. Rollout plan

1. Ship Phase 1 behind `ENABLE_GROUNDED_STORE_CREATION_V1=false` (default).
2. Enable on staging; create signage store from website + from description-only; confirm no vouchers/loyalty and incomplete offering when source empty.
3. Enable for new AI create / regenerate paths only.
4. Phases 2–6 behind same flag (or subflags if needed).
5. Production: enable for new creations after staging soak; never force-regenerate existing published stores.

## 9. Rollback plan

1. Set `ENABLE_GROUNDED_STORE_CREATION_V1=false` (or unset).
2. No DB migration required for Phase 1.
3. In-flight drafts generated under flag stay as-is; next regeneration with flag off restores old inventing behavior.

## 10. Affected routes / services

| Area | Paths |
|------|--------|
| Mission build | `structured_store_build` → `orchestraBuildStore` → `generateDraft` → `buildCatalog` |
| Research | `runStoreResearchPipeline`, `researchCatalogDraft` (later phases) |
| Publish | `publishDraftService`, `safePublishGeneratedDraft` / `commitDraft` (Phase 5) |
| Public | `publicStoreMapper` placeholder repair (Phase 5; new drafts only) |
| Dashboard review | `StoreDraftReview` (Phase 6) |

## 11. Acceptance criteria (full program)

- [x] No generic product/service silently invented (flag on)
- [x] Catalogue/media assets carry Business Truth provenance (Phase 3)
- [x] Unrelated media rejected (Phase 2)
- [ ] Service businesses get dedicated presentation-mode layouts (follow-on)
- [x] Incomplete source → clarification, not fabrication (Phase 1+)
- [x] Suggestions separated from facts (Phase 3/6)
- [x] Owner reviews uncertain content before publish (Phase 5/6)
- [x] Diagnostics on creation run + readiness summary in draft review
- [x] Automated tests cover grounding + readiness + publish validator
- [x] Existing published stores unchanged without owner regeneration (flag default off)

## 12. Known limitations

- Accept/review currently patches local draft state; persist-to-server for Accept should be hardened before production
- Explicit template mode can still load template catalogs; grounded post-process strips invented generics and marks readiness
- BusinessPresentationMode (portfolio / lead-gen layouts) not yet implemented
- Admin inspection panel for full creation-run diagnostics not yet built

## 13. Phase 1+2 shipped (2026-08-02)

Implemented behind `ENABLE_GROUNDED_STORE_CREATION_V1` (default off):

| Change | File(s) |
|--------|---------|
| Feature flag + min media score | `apps/core/cardbey-core/src/config/features.js` |
| Invent-stop, incomplete offering, media score, diagnostics | `…/draftStore/groundedStoreCreation.js` |
| Skip AI expansion / seed pad / AI→template invent; strip generics; attach diagnostics | `…/draftStore/buildCatalog.js` |
| Reject weak product image matches; mark `needs_media` | `…/draftStore/fillMissingDraftItemImages.js` |
| Hero media match gate | `…/mi/heroGenerationService.ts` |
| Skip Seed Library hero fallback when grounded | `…/draftStore/draftStoreService.js` |
| Tests | `…/draftStore/groundedStoreCreation.test.js` (7 passing) |

### Enable on staging

```
ENABLE_GROUNDED_STORE_CREATION_V1=true
# optional:
GROUNDED_MIN_MEDIA_MATCH_SCORE=0.55
```

### Rollback

Unset or set `ENABLE_GROUNDED_STORE_CREATION_V1=false`. No DB migration.

### Phases 3–6 shipped (2026-08-02)

| Phase | Deliverable | Files |
|-------|-------------|--------|
| 3 Provenance | `BusinessTruth` + `ContentReadinessModel` on draft assets | `contentReadinessModel.js`, stamping in `groundedStoreCreation.js` / `researchCatalogDraft.js` |
| 4 Honest presentation | Hero / image / price empty states (`Hero image needed`, `Image required`, `Price on request`) | core helpers + `StoreReviewHero`, `ProductReviewCard` |
| 5 Publish validator | blocking / warning / suggestion; core fail-closed on blocking | `groundedPublishValidator.js` → `publishDraftService.js`; client mirror in draft review |
| 6 Owner review | Summary lines + Accept / Edit / Replace image | `StoreReviewHero` summary, `ProductReviewCard` actions, patch merge |

**Content Readiness areas:** Identity · Catalogue · Media · Contact · Policies · Branding · SEO  
**Area states:** `ready` · `needs_review` · `needs_media` · `missing` · `suggested_only` · `blocked`

### Still pending (follow-ons)

- BusinessPresentationMode layouts (service / portfolio / lead-gen) — separate from readiness
- Persist Accept to server draft preview (currently local patch; publish path still uses core validator on persisted preview)
- Admin diagnostics panel for creation-run traces
- Gradual production rollout after staging soak

### Rollout (do not skip)

1. Staging: `ENABLE_GROUNDED_STORE_CREATION_V1=true`
2. Create signage + empty-source stores; confirm incomplete offering + review UX
3. Confirm publish blocked for suggested-only / unreviewed catalogue
4. Production soak → gradual rollout

### Confirmation checkpoints

- User: `proceed phase 1+2`
- User: Phases 3–6 provenance / honest UI / publish validator / owner review (this change)
