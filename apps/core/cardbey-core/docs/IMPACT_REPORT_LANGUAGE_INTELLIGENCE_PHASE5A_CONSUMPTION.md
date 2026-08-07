# Impact Report — Language Intelligence Phase 5  
## Controlled consumer cutovers (5A first)

**Date:** 2026-08-01  
**Milestone split:** 5A → 5B → 5C → 5D → 5E  
**This delivery:** **Phase 5A only** — shared localization consumption framework  
**Authority:** `isLanguageIntelligenceAuthoritative() === false` (unchanged for all of Phase 5)

---

## Phase 5 principle

Phase 4 taught Cardbey **how each person and business wants to communicate**.  
Phase 5 teaches every surface **how to consume that intelligence consistently**.

Do **not** ship a global “translate everything” switch.  
Do **not** make translated content the system of record.

---

## 1. Current UI localization paths

| Path | Role | Languages |
|------|------|-----------|
| Dashboard `src/i18n.js` + `useTranslation` / `useI18n` | System UI chrome | en, vi only |
| `localStorage`: `cardbey.lang`, `cardbey.preferredLocale` | Client UI preference | — |
| `Accept-Language` / `X-Locale` via `apiFetchHeaders` | Request hints to Core | — |
| Legacy `getTranslatedField` + `?lang=` | Public/signage content projection | Any key in `translations` JSON |
| LI localize APIs (opt-in) | Conversation / storefront view envelopes | LI registry (12) |
| LI preferences APIs | Durable user/business prefs | LI registry |

**Parallel stacks today:** i18next chrome ≠ Language Intelligence content localization.

---

## 2. Direct TranslationEngine consumers

| Consumer | Notes |
|----------|--------|
| `autoTranslateStore.ts` | Persist path — translations layer only |
| `conversationTranslator.js` | Internal on-read |
| `storefrontLocalizer.js` | Optional generateIfMissing |
| LI tests | Stub provider |
| **Dashboard / Campaign / CRM** | **None** |

**Phase 5A rule:** Surfaces must consume via `languageIntelligence/consumption/*`, not import `translateField` / `translateCatalogBatch` directly.

---

## 3. Destructive overwrite behaviour

| Path | Status |
|------|--------|
| `POST /api/stores/:storeId/translate` | Fixed (translations layer only) |
| `editArtifact` translate intents | **Still writes primary fields** — out of scope for 5A; track for 5B/5C gating |
| MI `rewrite_descriptions` overwrite | Canonical rewrite (not LI) — separate concern |
| Content Studio “Translate this text” | Canvas-local, not Product row |

---

## 4. System UI vs business-owned content

| Class | Examples | Phase 5 treatment |
|-------|----------|-------------------|
| `system_ui` | Nav, labels, empty states, validation | 5B — i18next / catalog; LI optional bridge later |
| `business_owned` | Product name/description, policies | Explicit request only; never auto in chrome |
| `campaign` | Headlines, captions, CTAs | 5C — opt-in derived variants |
| `conversation` | Inbox messages, suggested replies | 5D — on-read; never overwrite; never silent send |
| `storefront_public` | Visitor-facing catalog | 5E — suggestion + View original; fail-safe canonical |

---

## 5. Public-render latency & SEO risks

| Risk | Why | Phase 5A mitigation |
|------|-----|---------------------|
| Generating translations on public GET | OpenAI latency / cost / timeout | `allowGenerate` default **false** in consumption contract for public |
| SEO / crawlers seeing wrong lang | `document.lang` = UI locale; store DTO often ignores `?lang=` | 5E only; preserve canonical fields; no hreflang change in 5A |
| Missing fallback | Empty translated UI | Fail-safe: always return `originalText` as primary on error/missing |

---

## 6. Proposed shared consumer contract (5A)

```text
Surface (Dashboard / Campaign / CRM / Storefront)
        │
        ▼
LocalizationConsumption (shared facade)
        │  resolves preference + display mode + status
        │  applies glossary/cultural metadata (advisory)
        │  DualLanguageRenderer + attribution
        │  NEVER writes canonical content
        ▼
Existing translations layer  OR  (opt-in) TranslationEngine
```

**Contract fields (result):**

- `contentOwnership`
- `displayMode`: `original` | `translated` | `both`
- `status`: `ready` | `missing` | `loading` | `failed` | `fallback_original`
- `originalText` / `localizedText`
- `render` (from DualLanguageRenderer)
- `attribution` (“Translated by Cardbey AI”)
- `preference` / `cultural` / `glossary` (advisory metadata)
- `canonicalPreserved: true`
- `authoritative: false`

---

## 7. Feature flags & rollback

| Flag | Meaning |
|------|---------|
| `ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1` | 5A framework diagnostics / availability |
| Future 5B–5E | Separate flags per surface (not in 5A) |

**Rollback:** Flag off → diagnostics empty; no surface depends on consumption yet.

**Authority:** `isLanguageIntelligenceAuthoritative()` stays `false` through 5E.

---

## 8. Delivery boundaries

| Sub-phase | In this PR? | Scope |
|-----------|-------------|-------|
| **5A** | **Yes** | `consumption/` framework + thin dashboard types stub + tests |
| 5B | No | Dashboard chrome cutover |
| 5C | No | Campaign opt-in |
| 5D | No | CRM / conversation consumers |
| 5E | No | Public storefront controlled integration |

---

## 9. What could break (5A only)

| Risk | Mitigation |
|------|------------|
| Accidental surface wiring | 5A exports only; no MessageRenderer / campaign / public mapper imports |
| Surfaces importing engine anyway | Document + `assertConsumptionBoundary` helper |
| Account/i18n regression | No change to i18next or public mappers |

## Smallest safe patch

Add `src/lib/languageIntelligence/consumption/**` + flag + tests.  
Optional dashboard stub under `src/lib/languageIntelligence/` (types/comments only).

---

## Success criteria (5A)

- [x] Shared consumer contract + facade  
- [x] Ownership classes + fail-safe fallback  
- [x] Display modes + attribution + status  
- [x] Preference / cultural / glossary metadata hooks  
- [x] No surface cutover; authoritative false  
- [x] Engine not required for “missing → fallback original” path  

## Test results

```text
pnpm exec vitest run src/lib/languageIntelligence/__tests__/languageIntelligencePhase{1,2,3,4,5a}.test.js
→ 54 passed
```

**Review gate:** Complete 5A review before starting 5B (dashboard UI chrome cutover).
