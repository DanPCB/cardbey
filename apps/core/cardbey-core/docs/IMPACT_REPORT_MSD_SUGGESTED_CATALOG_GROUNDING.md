# Impact report: Modern Security Doors suggested catalogue (not website-sourced)

**Date:** 2026-07-31  
**Mission (local twin of production symptom):** `cms8riusr007bjvfs4w0pppzd`  
**Draft:** `cms8riuyw007yjvfsmvo1loak` · store slug `modern-security-doors-2`

## Evidence (persisted — not inferred from UI)

| Question | Answer |
|----------|--------|
| websiteUrl in draft.input? | **No** — only name, Home & garden, Melbourne, AUD |
| websiteUrl in mission metadata / deferred body? | **No** (`websiteMode: false`) |
| Research ran? | **Yes** — `storeCreationResearch` on Mission.context |
| Places configured (local)? | **Yes** (key present; value not logged) |
| Places match? | **Yes** — GBP `name-exact`, confidence **0.94** |
| Aggregate research confidence | **0.77** |
| official_website in sourcesUsed? | **No** — only `google_business` + manual |
| extractedItems / catalog products | **null / empty** |
| fallbackToGenerated | **true** |
| ownerReviewRequired | **true** |
| Draft meta.contentOrigin | **suggested** · catalogSource **ai** |
| Item count | **47** suggested (template/AI), invented prices |

## Exact branch that produced the mock catalogue

`buildCatalogForStoreReactStep` → research returned `fallbackToGenerated: true` (no catalog items) → `shouldApplyResearchCatalogToDraft` false → `stampSuggestedCatalogOrigin(await buildCatalog(params))`.

Root extractor defect: `extractMenuLinesFromHtml` **requires a parseable price** (`if (!Number.isFinite(price)…) continue`). Service-category nav (Plantation Shutters, Roller Shutters, …) has no prices → discarded. Additionally, Places website is only registered when `extractFromWebsite` returns rows — empty extract drops the official URL.

## Production flags

| Flag | Local `.env` | Production Render |
|------|--------------|-------------------|
| `ENABLE_STORE_RESEARCH_PIPELINE` | `1` | **Could not read** via available CLI (confirm in Render dashboard) |
| `PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW` | unset (defaults **on** non-prod) | Defaults **off** in production if unset |
| `GOOGLE_PLACES_API_KEY` | configured | Confirm in Render (presence only) |

For this mission, staging flag was irrelevant: `fallbackToGenerated` already blocked apply.

## Smallest safe patch (implemented)

1. `extractServiceCategoryLinksFromHtml` — nav/category labels without prices.
2. Places website always registered as `official_website` even when HTML extract empty.
3. `store.catalog.authority_selected` + `catalogGrounding` / `catalogAuthority` on draft meta.
4. `stampSuggestedCatalogOrigin` nulls invented prices (`priceWasNotExplicitlyProvided`).
5. Owner UI badges: Sourced / Awaiting review / AI suggestion.
6. Tests: category extract, authority reasons, suggested price nulling, badge copy.

## What could break

| Risk | Mitigation |
|------|------------|
| Nav noise as categories | Skip generic nav labels; cap count; needsOwnerReview |
| Quote-only catalogues look empty | CTA “Request a quote”; owner review |
| Suggested catalogues lose display prices | Intended — honest grounding |

## Production acceptance (after deploy)

Rerun Modern Security Doors. Expect:

- `store.catalog.authority_selected` with `sourced` or `sourced_pending_review` when Places returns a website and nav categories extract
- Or explicit `fallbackReason` (`WEBSITE_NOT_FOUND` / `NO_CATALOG_CONTENT_FOUND`) — never silent mock inventory with USD prices
- Confirm Render: `ENABLE_STORE_RESEARCH_PIPELINE=1`, `PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW=1`, Places key present

## Remaining limitations

- If Google Place Details has no `websiteUri` and the form omits website, crawl cannot run → `WEBSITE_NOT_FOUND`.
- Category extractor prefers nav/dropdown HTML; unusual JS-only menus may still miss categories.
- Production Render env vars were not readable from this workspace CLI — verify in dashboard.
