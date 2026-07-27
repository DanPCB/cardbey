# Impact Report: Phase 2 Draft Generation Guardrails

## Summary

Additive backend-only guardrails for first-load draft generation: vertical-aware image candidate filtering and de-generic item naming, behind feature flag `ENABLE_DRAFT_GUARDS` (default **false**).

## (1) What could break

- **Store creation → publish → frontscreen:** Could break if preview shape or required fields changed (e.g. `items[].name`, `items[].imageUrl`, `hero`, `avatar`, `storeType`), or if draft never reaches `ready`, or if commit/publish expect non-null imageUrl where we now set null.
- **Current assessment:** No contract change. When flag is OFF (default), behavior is unchanged. When flag is ON: we only (a) set `imageUrl` to `null` for unsafe candidates (instead of leaving a bad URL), and (b) replace generic item names with vertical/category-based names. We do not remove items, rename keys, or change response shape.

## (2) Why risk is low

- All new logic is behind `ENABLE_DRAFT_GUARDS`. Default is false in prod until validated.
- Changes are local to `generateDraft()` in `draftStoreService.js`. GET /draft, commit, and publish already tolerate missing `imageUrl` (null/placeholder). Frontscreen and public store mapper use `imageUrl` optionally.
- Single new module `draftGuards.js`; no refactors to auth, routing, or publish flow.

## (3) Impact scope

- **Affected:** First-load draft generation only: `POST /api/draft-store/generate` and `POST /api/mi/orchestra/start` (goal `build_store`) when they call `generateDraft()`.
- **Not affected:** Draft by-store, GET draft by id, PATCH preview, commit, publish, frontscreen display (except improved content when flag is on).

## (4) Smallest safe patch

- Add `src/services/draftStore/draftGuards.js` with: `effectiveVertical()`, food blocklist check, `applyItemGuards()` (null unsafe imageUrl), `applyNameGuards()` (replace generic names).
- In `draftStoreService.js`: read `ENABLE_DRAFT_GUARDS`; if true, compute effectiveVertical from profile/input; after image batch, apply item guards (null imageUrl for blocked); before building final preview items, apply name guards. No changes to route handlers or publish logic.
- Add `ENABLE_DRAFT_GUARDS=false` to `.env.example` with short comment.
- Add tests that run with flag on: food prompt → no blocked image URLs (or null); no generic names in returned items.

## File list (≤ 10 files)

| # | File | Action |
|---|------|--------|
| 1 | `docs/IMPACT_REPORT_DRAFT_GUARDS.md` | Add (this report) |
| 2 | `src/services/draftStore/draftGuards.js` | Add (new module) |
| 3 | `src/services/draftStore/draftStoreService.js` | Edit (wire guards) |
| 4 | `.env.example` | Edit (flag + comment) |
| 5 | `tests/draft-guards.test.js` | Add (integration/unit) |

## Enabling locally

Set in `.env` (or environment):

```bash
ENABLE_DRAFT_GUARDS=true
```

Then restart the API. First-load draft generation (POST `/api/draft-store/generate` and build_store via `/api/mi/orchestra/start`) will:

- Infer **effectiveVertical** (food, florist, trades, products).
- For **food**: skip image generation for items whose name/description contain blocked keywords (shoe, fashion, model, office, etc.); set `imageUrl` to `null` for any such candidate.
- **De-generic names**: replace names matching `general N` / `retail N` / `product N` or too short with category label + index (e.g. "Fresh Juice 1", "Drinks 2").
