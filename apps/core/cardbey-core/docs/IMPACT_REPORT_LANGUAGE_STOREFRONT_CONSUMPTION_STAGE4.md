# Impact Report — Language Storefront Consumption Cutover (Stage 4)

**Date:** 2026-08-06  
**Depends on:** LI Phases 1–5A, Auto Resolution Stage 0–2, Dashboard Pref Bridge Stage 3  
**Authority:** `isLanguageIntelligenceAuthoritative() === false`  
**Pilot surface:** `public_storefront_v1`

---

## VERDICT

**STOREFRONT_CONSUMPTION_PILOT_READY** — pilot cutover for `/s/:slug` via the consumption facade, store opt-in, and fail-closed flags. Not a global multilingual / SEO launch.

---

## PILOT_SURFACE

| Item | Value |
|------|--------|
| Route | `/s/:slug` (`/store/:slug`) |
| Entry | `PublicStoreSlugRoute.tsx` |
| Renderer | `CanonicalStorefrontRenderer` → `WebsitePreviewPage` |
| Surface id | `public_storefront_v1` |
| Fields | Store `name`/`description`; product `name`/`description`/`category` |

**Out of pilot:** `PublicStorePage` happy path, draft preview, booking, feed cards, mini-website section HTML, FAQ blobs.

---

## CURRENT_RENDER_PATH

```text
GET /api/public/stores/:slug (+ optional ?lang=&displayMode=)
  → resolvePublicStoreFromArtifact (canonical DTO)
  → applyStorefrontConsumptionCutover (when flags + store opt-in)
  → PublicStoreSlugRoute (CSR React Query; key includes lang + mode)
  → WebsitePreviewPage
```

CSR only (no SSR). Hydration mismatch telemetry reserved for future SSR.

---

## CUTOVER_BOUNDARY

Requires **all** of:

1. LI V1 + engine + auto-resolution  
2. `ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1`  
3. Store `storefrontLanguagePolicy.publicLocalizationEnabled === true`  
4. `translationPolicy !== original_only`  

Else: canonical DTO. Exceptions → canonical (never blank page).  
`generateMissingTranslations: false`.

---

## IMPLEMENTED

- `StorefrontLanguagePolicy` (defaults fail closed)  
- `applyStorefrontConsumptionCutover` using `consumeLocalizedContent`  
- Reason codes + privacy-safe telemetry  
- Public slug route wiring (`optionalAuth` + guest cookie + resolve)  
- Client selector + session displayMode (storefront-only; guest cookie for anonymous lang)  
- Query key includes lang + displayMode  
- Diagnostics `surfacesWired: ['public_storefront_v1']` when cutover flag on  
- Business prefs PATCH accepts `storefrontLanguagePolicy`

---

## UNCHANGED

- Localized URLs / hreflang / sitemap / crawler redirects  
- Live public TranslationEngine generation  
- Dashboard Stage 3 bridge semantics  
- Global LI authority (`false`)  
- Mini-website section copy localization  

---

## STORE_OPT_IN_POLICY

| Field | Default (existing stores) |
|-------|---------------------------|
| `publicLocalizationEnabled` | `false` |
| `translationPolicy` | `original_only` |
| `defaultDisplayMode` | `original` |

Opt-in sets `existing_translations_only` + supported languages explicitly.

---

## RESOLUTION_FLOW

Anonymous: explicit → guest cookie → Accept-Language → device → regional → English  
Signed-in: account manual → explicit → guest (if no manual) → auto  

Store default language = content fallback, not visitor override.

---

## CONSUMPTION_FACADE_USAGE

`consumeLocalizedContent` per field with `contentOwnership: storefront_public`, `explicitOptIn: true`, `allowGenerate: false`.

---

## DISPLAY_MODES

| Mode | Behaviour |
|------|-----------|
| original | Canonical fields |
| translated | Existing translation or per-field canonical fallback |
| both | Translated primary + dual meta strip for store name (pilot) |

Interface locales: **en|vi** only; content may differ (e.g. content `ja` unsupported → fall back).

---

## TRANSLATION_FALLBACK

manual / existing JSON → canonical field. Mixed pages note: “Some content is shown in its original language.”  
`translatedByCardbeyAI` only with explicit AI provider metadata (Stage 4 path does not generate).

---

## CACHE_POLICY

Client React Query: `['publicStore', slug, …, lang, displayMode]`.  
Server projection fingerprint helper: `buildStorefrontLocalizationCacheKey(...)`.  
Disabled cutover: prior canonical cache behaviour.

---

## SSR_AND_HYDRATION

No storefront SSR today. Initial paint waits on React Query; language applied with the same request params (no separate flash path when cutover off).

---

## FEATURE_FLAGS

| Flag | Role |
|------|------|
| `ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1` | Core cutover |
| `ENABLE_LANGUAGE_STOREFRONT_SELECTOR_V1` | Selector allow |
| `VITE_ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1` | Client fetch params |
| `VITE_ENABLE_LANGUAGE_STOREFRONT_SELECTOR_V1` | Client selector UI |

All fail closed when unset.

---

## TELEMETRY

`language.storefront.cutover_selected`  
`language.storefront.canonical_fallback`  
`language.storefront.translation_consumed`  

Fields: surface, storeIdHash, languages, mode, status, fallbackFieldCount — no content text.

---

## SEO_BOUNDARY

Visitor-experience cutover only. Same URL; no hreflang; no sitemap change; no crawler language redirect. Language-varying content under one URL is **not** the final multilingual SEO architecture.

---

## TEST_RESULTS

| Suite | Result |
|-------|--------|
| Core LI Phase 1–5A + Stage 0–3 + Stage 4 | **102 passed** |
| Dashboard Stage 3 bridge | **6 passed** |

---

## ROLLBACK

Unset Stage 4 Core + Vite flags. Stores without opt-in already canonical. No schema migration required.

---

## KNOWN_LIMITATIONS

- Mini-website section copy not localized  
- Both mode dual strip is store name–focused in pilot  
- Interface chrome still en|vi  
- No SSR  
- No owner UI yet for toggling `publicLocalizationEnabled` (API PATCH only)  
- `editArtifact` overwrite risk remains upstream  

---

## NEXT_STAGE

- **5A:** Pilot store validation + translation quality controls + owner opt-in UI  
- **5B:** Multilingual SEO architecture only after stable consumption  
