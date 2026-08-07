# Architecture Audit — Automatic Language Detection & Display Switching Layer

**Date:** 2026-08-06  
**Status:** Audit only — **no implementation in this step**  
**Governing constraint:** Extend existing Language Intelligence; do not create a second competing resolver.  
**Authority today:** `isLanguageIntelligenceAuthoritative() === false`

---

## VERDICT

Cardbey already has a substantial **Language Intelligence (LI)** stack (Phases 1–5A) plus a separate **dashboard i18next chrome** layer (`en`/`vi`). They are **not unified**.

| Layer | Role today | Authoritative for display? |
|-------|------------|----------------------------|
| LI `resolveLanguage` + prefs + engine + consumption | Content localization / opt-in APIs | **No** |
| Dashboard `i18n.js` + `LanguageToggle` + `cardbey.lang` | UI chrome strings | **Yes for chrome only** |
| `getTranslatedField` + `?lang=` | Public/API content projection | **Only when translations JSON exists** |

A production Auto Detection & Display Switching Layer must **extend LI** (especially resolver + preferences + consumption), **bridge** dashboard chrome, and add guest cookie / SSR envelope / scoped prefs — without mutating canonical content or making inference authoritative.

---

## CURRENT_LANGUAGE_ARCHITECTURE

### Language Intelligence (Core)

Root: `apps/core/cardbey-core/src/lib/languageIntelligence/`

| Phase | Modules |
|-------|---------|
| 1 | `contracts/`, `definitions/`, `registries/`, `resolution/`, `formatting/`, `adapters/` |
| 2 | `engine/` — TranslationEngine, Cache, Memory, Audit, Confidence, Providers |
| 3 | `conversation/`, `storefront/`, `dualLanguage/` |
| 4 | `preferences/`, `cultural/`, `glossary/` |
| 5A | `consumption/` — shared LocalizedConsumptionView facade; `surfacesWired: []` |

Entry: `index.js` → `getLanguageIntelligenceDiagnostics()`.

### Parallel UI stack (Dashboard)

| Piece | Path |
|-------|------|
| i18next catalog | `apps/dashboard/cardbey-marketing-dashboard/src/i18n.js` |
| Toggle | `components/common/LanguageToggle.tsx` |
| Hook | `hooks/useI18n.js` |
| Headers | `lib/apiFetchHeaders.ts` → `Accept-Language`, `X-Locale` |
| Stub types | `lib/languageIntelligence/consumptionClient.ts` |

### Legacy content path

`services/i18n/translationUtils.js` — `getTranslatedField` / `setTranslatedFields`  
Used by `publicStoreMapper`, `publicProduct`, `listStoreProducts`, device/signage routes.

---

## EXISTING_SIGNAL_SOURCES

| Signal | Used today? | Where |
|--------|-------------|-------|
| Explicit session (query `?lang=`) | Partial | Dashboard chrome (`en`\|`vi` only); API content `?lang=` |
| Account preference | Yes (LI) | `AccountProfile.languages` → `{ spoken, preference }` |
| Visitor cookie | **No** | — |
| Visitor localStorage | Yes (chrome only) | `cardbey.lang`, `cardbey.preferredLocale` |
| Conversation / storefront scoped prefs | Partial | Per-request args to localize APIs; not durable scopes |
| Workspace preference | Partial | Business `stylePreferences.languageIntelligence` |
| Browser `Accept-Language` | Partial | Passed into some LI APIs; not first-paint SSR for SPA |
| `navigator.languages` | Yes (chrome) | `i18n.js` detectInitialLanguage |
| Device locale | Contract only | `deviceLanguage` on resolver; rarely supplied |
| Interaction history inference | **No** | — |
| Account / business region | Yes | Region registry + prefs; default **AU** |
| IP country | **No** (for language) | — |
| Timezone / GPS | **No** (for language) | — |
| Store default language | Partial | Business locale block; not full StoreLanguageConfiguration |
| Global default | Yes | English (`FALLBACK_LANGUAGE`) |

---

## EXISTING_PRECEDENCE_RULES

### LI `resolveLanguage` (`resolution/languageResolver.js`)

```text
explicitLanguage
  → accountPreference.preferredLanguage
  → browserLanguage
  → deviceLanguage
  → regionProfile.defaultLanguage
  → English
```

- Manual selection (`manualLanguageSelection` or explicit) stops after first of explicit/account.
- Setting `preferredLanguage` implies `manualLanguageSelection: true`.
- Region for formatting defaults to **AU** when unset.
- **Does not** distinguish `displayLanguage` vs `interfaceLanguage` vs `regionalLocale` as separate outputs (single `language` + `intlLocale` + currency/date/units).

### Dashboard chrome detect (`i18n.js`)

```text
?lang=en|vi → localStorage cardbey.lang → navigator → en
```

### Content API

`?lang=` / Accept-Language → `getTranslatedField` if `translations[lang]` exists; else canonical.

### Gaps vs requested Tier 1–5

| Requested tier | Status |
|----------------|--------|
| Explicit session / account / visitor cookie | Session + account yes; **cookie missing**; localStorage chrome-only |
| Context-specific prefs | Request-scoped only; **no durable scoped model** |
| Ordered Accept-Language list | **Single** browser string today; no q-weight parsing |
| Interaction inference | Missing |
| Store-supported / regional / English fallback | Partial (region + English); **no store supportedDisplayLanguages list** |

---

## EXISTING_STORAGE

| Store | Shape | Notes |
|-------|-------|-------|
| `AccountProfile.languages` | Legacy `string[]` **or** `{ v:1, spoken[], preference }` | Backward-compatible reader |
| `Business.stylePreferences.languageIntelligence` | `{ locale, culturalStyle, glossary[] }` | Owner prefs + glossary |
| `Business/Product.translations` | `{ [lang]: { field: string } }` | View layer only |
| `localStorage` `cardbey.lang` | `en` \| `vi` | Chrome; not SSR-readable |
| First-party language cookie | **None** | Required for guest SSR |
| Session scoped language | **None** as shared model | |
| Interaction candidates | **None** | |

**Broken client path:** Dashboard `patchBusinessLocale` → `PATCH /api/business/:id/locale` — **no Core route**. Real path is LI business preferences API.

---

## EXISTING_TRANSLATION_PATHS

| Path | Behavior |
|------|----------|
| `POST /api/stores/:storeId/translate` | TranslationEngine → **translations JSON only** (overwrite eliminated) |
| `POST /api/language-intelligence/localize-conversation` | On-read; dual-language; no message mutation |
| `POST /api/language-intelligence/localize-storefront` | View + optional persist translations |
| TranslationEngine | Cache × revision; confidence; providers (OpenAI / stub) |
| Consumption facade | Status / opt-in / fallback; **no surface wiring** |
| `editArtifact` “translate…” | **Still risk:** can write primary fields |
| i18next | Static UI catalogs; Language Agent maintains quality |

Canonical content is preserved on the store-translate path. Policy classes exist (`conversation`, `product`, `marketing`, …).

---

## EXISTING_RENDER_PATHS

| Surface | Language behaviour today |
|---------|--------------------------|
| Dashboard chrome | i18next + LanguageToggle |
| Public storefront SPA | Chrome toggle; product fields usually **canonical** (client fetch often omits `?lang=`) |
| Public API mappers | Optional `lang` → translated fields |
| Device / signage | `?lang=` / Accept-Language |
| Agent chat UI | No View Original wiring |
| SSR HTML shells | Often `lang="en"` hardcoded; SPA hydrates client-side |
| SEO | **No** hreflang, lang-prefixed routes, or multilingual sitemaps found |

---

## EXISTING_FEATURE_FLAGS

| Flag | Purpose |
|------|---------|
| `ENABLE_LANGUAGE_INTELLIGENCE_V1` | Foundation |
| `ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1` | Engine |
| `ENABLE_LANGUAGE_INTELLIGENCE_CONVERSATION_V1` | Conversation localizer |
| `ENABLE_LANGUAGE_INTELLIGENCE_STOREFRONT_LOCALIZER_V1` | Storefront localizer |
| `ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1` | Prefs / glossary / cultural APIs |
| `ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1` | Consumption framework |

**Not present:**  
`ENABLE_LANGUAGE_AUTO_RESOLUTION_V1`, visitor cookie flag, context preference flag, interaction inference flag, public storefront switch flag.

Default: on in non-prod when unset; production off unless set. Authority always false.

---

## EXISTING_APIS (localization-related)

| Method | Path |
|--------|------|
| POST | `/api/stores/:storeId/translate` |
| POST | `/api/language-intelligence/localize-conversation` |
| POST | `/api/language-intelligence/localize-storefront` |
| GET/PATCH | `/api/language-intelligence/preferences` |
| GET/PATCH | `/api/language-intelligence/business/:storeId/preferences` |
| GET/POST | `.../glossary`, `.../glossary/propose`, `.../glossary/approve` |
| GET | `/api/language-intelligence/cultural-style` |

Missing vs spec: DELETE preferences; PUT alias; public resolve envelope; guest cookie sync; context preference APIs.

---

## CONCEPT SEPARATION (today vs required)

| Concept | Today | Required |
|---------|-------|----------|
| `canonicalContentLanguage` | Implicit (primary field language); not first-class store config | Explicit store field |
| `displayLanguage` | Merged into resolver `language` | Distinct |
| `interfaceLanguage` | Dashboard i18next only | Distinct; controlled UI resources |
| `translationSourceLanguage` | Heuristic / identity | Explicit |
| `visitorPreferredLanguage` | localStorage chrome | Cookie + LI |
| `businessPreferredLanguage` | LI business locale | Keep + store config |
| `regionalFormattingLocale` | Coupled to region profile / intlLocale | Independent of display language |

**Critical gap:** Vietnamese display + AUD / en-AU formatting is **not** cleanly modeled (currency often follows region default AU, but language/formatting are not first-class dual outputs).

---

## GAPS

1. **No single shared auto-resolution entrypoint** used by dashboard + public + SSR.  
2. **No guest first-party cookie** (`cardbey_language`) for SSR-compatible persistence.  
3. **Chrome ↔ account prefs not synced** (toggle does not call LI PATCH).  
4. **No ordered Accept-Language / q-weight matching** against supported list.  
5. **No context-scoped preference model** (storefront vs dashboard vs conversation) with lifecycle.  
6. **No StoreLanguageConfiguration** (`canonicalLanguage`, `supportedDisplayLanguages`, `translationPolicy`).  
7. **No interaction-language inference** (advisory).  
8. **No public LanguageResolutionEnvelope** for hydration-safe SSR/SPA.  
9. **No frontend LanguageProvider** SSoT (i18next state ≠ LI state).  
10. **No SEO strategy implementation** (hreflang / lang URLs / crawler policy).  
11. **No language telemetry events**.  
12. **Public storefront does not consume** LI / consumption facade.  
13. **UI catalog** still en/vi while LI registry has 12 languages.  
14. **`useAutomaticLanguage` flag** not in preference model (only `manualLanguageSelection`).  
15. **Authority remains false** — correct for staged rollout; auto-switch must stay flagged.

---

## RECOMMENDED_EXTENSION_POINTS

Do **not** fork a second resolver. Extend LI as follows:

| Extension | Location | Notes |
|-----------|----------|-------|
| **AutoResolution facade** | `languageIntelligence/resolution/autoLanguageResolver.js` (new) | Wraps/extends `resolveLanguage` with Tier 1–5 inputs, diagnostics, reason codes; outputs `displayLanguage`, `interfaceLanguage`, `regionalLocale` separately |
| **Locale normalize** | `contracts/` or `resolution/localeNormalize.js` | Exact → base → regional variant; never invent codes |
| **Visitor cookie** | Core middleware + dashboard sync | `cardbey_language`; SameSite=Lax; Secure in prod |
| **Preference model** | Extend `UserLocalePreference` | Add `useAutomaticLanguage`, `preferredRegionalLocale`, `source` |
| **Context prefs** | New `preferences/contextPreferenceStore.js` | Scoped; non-overwriting of global |
| **Store language config** | Extend `stylePreferences.languageIntelligence` | `canonicalLanguage`, `supportedDisplayLanguages`, `translationPolicy` |
| **Public envelope API** | `GET /api/language-intelligence/resolve` | Safe PublicLanguageResolutionEnvelope |
| **Consumption bridge** | Wire `consumeLocalizedContent` after resolve | Keep opt-in / fallback rules from 5A |
| **Dashboard provider** | Extend `consumptionClient` + LanguageProvider | Initialize from server envelope; sync i18next interfaceLanguage |
| **Flags** | New `ENABLE_LANGUAGE_AUTO_RESOLUTION_V1` (+ visitor/context/inference/storefront) | Production default off |
| **SEO** | Document-only first; implement after routing audit | Prefer cookie/account for auth; careful with indexable public |

### Suggested rollout (maps to requested stages)

| Stage | Flag / work | Surfaces |
|-------|-------------|----------|
| 0 | Diagnostics + auto resolver behind flag (shadow compare vs chrome) | None live |
| 1 | Anonymous storefront detection | Public store (suggestion) |
| 2 | Guest cookie persistence | SSR-compatible |
| 3 | Account preference sync with LanguageToggle | Dashboard + account |
| 4 | Context-scoped prefs | Conversation / storefront |
| 5 | Interaction inference (advisory only) | Suggest UI |
| 6 | Broader surfaces | Checkout, booking, mobile |

Keep `isLanguageIntelligenceAuthoritative() === false` until versioning, approval, staleness, audit, rollback, and cost controls exist (as previously decided for Phase 5).

---

## SEO_BEHAVIOUR (current → proposed documentation buckets)

| Surface | Today | Proposed stance (to confirm before coding) |
|---------|-------|--------------------------------------------|
| PUBLIC_INDEXABLE_STOREFRONTS | Single URL; cookie/header not for SEO | Do **not** cookie-vary indexed HTML without hreflang plan; prefer explicit lang segment **or** crawlable canonical + on-page switch |
| PUBLIC_BUSINESS_PROFILES | Same | Same as storefront |
| AUTHENTICATED_DASHBOARD | Cookie/localStorage OK | Account + cookie OK |
| CONVERSATIONS | N/A indexable | Context prefs OK |
| CHECKOUT_AND_BOOKING | Inherit storefront | Inherit displayLanguage; no SEO URLs required |

**Audit finding:** No hreflang / lang routes / multilingual sitemaps today → **do not introduce `/vi/store/...` until SEO strategy is signed off**.

---

## PRIVACY_BOUNDARIES (current posture)

- Prefer browser language over location (location unused for language today — keep it that way).  
- No language cookie yet → no IP-in-cookie risk yet.  
- Interaction inference must not become permanent preference without consent.  
- Diagnostics must stay admin/dev; public envelope must be safe (no IP, no history).

---

## MIGRATION_PLAN (outline — implement later)

| Item | Policy |
|------|--------|
| `AccountProfile.languages` | Extend preference object; keep array compat |
| `manualLanguageSelection` | Map to `useAutomaticLanguage: !manual` |
| `cardbey.lang` | Bridge: on login/toggle, sync to LI; do not wipe manual account prefs |
| Guest cookie | New; promote to account only with consent |
| Business LI block | Additive store language config fields |
| Rollback | Flags off → prior chrome + `?lang=` behaviour |

---

## NEXT STEP (awaiting approval)

1. ~~Architecture audit~~ **(this document)**  
2. Impact report for Stage 0–2 implementation (`IMPACT_REPORT_LANGUAGE_AUTO_DETECTION_DISPLAY_SWITCH_V1.md`)  
3. Implement **only** behind flags:  
   - Extended auto resolver + locale normalize  
   - Preference model fields (`useAutomaticLanguage`, `preferredRegionalLocale`)  
   - Guest cookie + `GET /api/language-intelligence/resolve`  
   - Shadow diagnostics (no public cutover)  

**Do not implement** storefront switch, SEO routes, or inference until Stage 0–2 is reviewed.

---

## REFERENCES

- `src/lib/languageIntelligence/resolution/languageResolver.js`  
- `src/lib/languageIntelligence/preferences/*`  
- `src/lib/languageIntelligence/consumption/*`  
- `src/routes/i18n/languageIntelligence*.js`  
- `src/routes/i18n/autoTranslateStore.ts`  
- Dashboard `src/i18n.js`, `LanguageToggle.tsx`  
- Prior: `IMPACT_REPORT_LANGUAGE_INTELLIGENCE_PHASE5A_CONSUMPTION.md`  
