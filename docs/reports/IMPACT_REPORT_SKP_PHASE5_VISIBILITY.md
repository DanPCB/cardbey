# Impact Report — Phase 5 AI visibility surfaces (gated)

Date: 2026-08-25  
Depends on: Phases 1–4 complete in code; **production SSR confirmation still required before claiming AI visibility**

## Change summary (smallest safe patch)

1. Add **flag-gated** citation probe module + dry-run scheduler hook (default OFF).
2. Replace `get_review_summary` mock with a real read path over existing Review data **if a Review model/store exists**; otherwise return honest empty summary (not fake stars).
3. Virtual KOL: **foundation types/stub only** behind flag — no public claims.
4. Keep `SKPVisibility.aiSearchReady` true only when indexable + jsonLdReady + `attributionV1` (already Phase 3). Do **not** set true solely because Phase 5 files exist.
5. Explicitly **do not** add `llms.txt` or a separate AI sitemap.

## (1) What could break

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Claiming AI visibility without production crawl | High | Flags default OFF; docs state production SSR gate |
| Fake reviews replacing mock with invented data | High | Empty/honest response if no Review rows |
| Citation probe hitting external AI APIs | Medium | Dry-run / log-only until ENABLE_CITATION_PROBES=true |
| Virtual KOL half-shipped UX | Medium | Types + no-op service only |

## (2) Why

Phase 5 is measurement + honest review reads, not marketing claims.

## (3) Impact scope

- New `lib/visibility/*` (probes, optional KOL stub)
- Review summary tool/handler path only
- Feature flags in features.js + .env.example
- No Business writes; no sitemap/llms.txt

## (4) Gate

Phase 5 COMPLETE for **code scaffolding** only when tests pass and flags default OFF.  
**Product claim “AI search ready”** remains blocked until staging/prod bot prerender + attribution ingest verified.
