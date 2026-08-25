# Impact Report — Fix store bot prerender fallthrough

Date: 2026-08-25  
Scope: `storefrontPrerenderRoutes.js` + SPA `/s` exclusion in `server.js`

## Finding

`app.use('/s', storefrontPrerenderRoutes)` is already mounted **before** the SPA catch-all (~L1240 vs ~L1362). Staging `{"error":"Not found"}` is the **final JSON 404**, which means either (a) deploy lacks this mount, or (b) the handler does not respond and the request falls through — current handler returns text/JSON 404 itself for browsers and missing SKP, which does **not** match that exact body.

## Fix (smallest safe)

1. Non-bot → `next()` (SPA / downstream handles humans).
2. Missing/non-indexable SKP → `next()` (not text/JSON 404 from prerender).
3. SPA catch-all skips `/s` so browser fallthrough is intentional and bots that `next()` are not served empty SPA shell when static SPA exists.
4. Keep mount where it is; add startup log for deploy verification.

## What could break

- Core-only hosts without SPA: browsers on `/s/:slug` get final JSON 404 (same class of outcome as today for non-bots).
- Bots on unpublished slugs: fall through instead of explicit 404 text.
