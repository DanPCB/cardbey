# Impact Report — SKP SEO canonical base + JSON-LD readiness

Date: 2026-08-25  
Scope: `publicWebBase.js`, `buildSKP.js`, sitemap/robots/prerender consumers

## Change

1. Add `publicCanonicalWebBase()` preferring `PUBLIC_WEB_BASE_URL`, then existing public SPA env keys, then `https://cardbey.com`. Used for SKP `canonicalUrl`, store sitemap `<loc>`, robots Sitemap lines, and prerender HTML — **not** for auth/SPA redirects (`publicWebBase()` unchanged).
2. Relax `jsonLdReady` to not require `suburb` (Herbal Head Spa has null suburb; name + description + category are enough for LocalBusiness).

## (1) What could break

| Risk | Mitigation |
|------|------------|
| Staging SEO URLs flip to cardbey.com if PUBLIC_WEB_BASE_URL unset and PUBLIC_APP_URL unset | Keep PUBLIC_APP_URL on staging (current); new key optional |
| Auth redirects change | Not touched — still `publicWebBase()` |
| Thin stores emit JSON-LD without locality | Valid schema.org; address locality omitted when null |

## (2) Smallest safe patch

New helper + wire SKP/sitemap/robots/prerender to it; one-line jsonLdReady guard change.
