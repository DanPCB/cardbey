# Impact Report — Phase 2 Storefront prerender + JSON-LD + sitemap

Date: 2026-08-25  
Depends on: Phase 1 SKP (`feat(skp)` @ 462c72303)  
Scope: crawlable HTML for `/s/:slug` + store URLs in sitemap

## Change summary

1. Core Express: bot/social prerender for `GET /s/:slug` using `buildSKP` + `skpToJsonLd`.
2. Core: dynamic `GET /sitemap-stores.xml` listing published store `/s/:slug` URLs.
3. Dashboard `public/robots.txt`: explicitly `Allow: /s/` (and keep existing sitemap pointer).
4. Dashboard `public/sitemap.xml`: note/link pattern — prefer Core dynamic store sitemap; add Sitemap line for store feed if Core origin is known via comment + robots.

## (1) What could break

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Browser UX for `/s/:slug` if Core hosts the marketing domain | Medium | Bot UA + `?_prerender=1` only; browsers `next()` to existing handlers / 404 so SPA host still owns humans |
| Duplicate content if both SPA and Core serve `/s/` | Medium | Prerender only for crawler UAs; canonical URL points at public web origin |
| Sitemap size / perf | Low | Cap 50k; select slug+updatedAt only |
| robots.txt blocking API | None | Unchanged Disallow `/api/` |

## (2) Why

Without crawlable HTML, AI/search agents see an empty Vite shell. Phase 1 SKP already produces JSON-LD; Phase 2 only delivers it.

## (3) Impact scope

- Core: new route module + server mount; read-only Prisma queries
- Dashboard: robots.txt (and optional sitemap index pointer)
- No Business writes; `aiSearchReady` remains false

## (4) Smallest safe patch

Mount prerender + store sitemap on Core; allow `/s/` in robots; do not add `llms.txt` or a separate AI sitemap.
