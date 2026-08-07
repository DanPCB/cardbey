# Global Language Intelligence & Regional Adaptation — Phase 0 Architecture Map

**Status:** Audit complete — Phase 1 scaffolding follows this plan.  
**Date:** 2026-07-31  
**Governing principle:** Original content is always preserved. Translation is a presentation layer on top of canonical business data. No module translates independently.

---

## 1. Current architecture map

```text
Dashboard UI strings
        │
        └─► i18next / react-i18next (en|vi only)
              localStorage: cardbey.lang / cardbey.preferredLocale
              src/i18n.js + modular catalogs
              Language Agent (scan/fix UI catalog quality)

Business content
        │
        ├─► Product/Business/Playlist.translations Json?
        │     getTranslatedField / setTranslatedFields (view-layer helpers)
        │
        ├─► POST /api/stores/:storeId/translate
        │     ⚠ OVERWRITES primary name/description/category (violates principle #1)
        │
        └─► Public/signage mappers (?lang= / Accept-Language)
              only effective when translations JSON populated

LLM / AI
        │
        ├─► localePrompt.js — ALLOWED_LOCALES en|vi|zh|ja|ko
        │     detectMessageLocale (VI heuristics), resolveIntakeLocale
        │
        └─► executionFrame tries Business.locale (schema drift — field missing)

Regional
        │
        ├─► currencyInfer + formatMoney (AUD default)
        └─► getIntlLocale → vi-VN | en-AU (dashboard dates only)

Chat
        │
        └─► Generate-in-locale only — no WeChat-style translate-on-read
```

### 1.1 Canonical sources of truth today

| Concern | Owner today | Gap |
|--------|-------------|-----|
| UI chrome strings | Dashboard `i18n.js` | en/vi only; not business content |
| Business facts | Prisma primary fields | Auto-translate overwrites them |
| Parallel lang map | `translations` JSON | Underused; not written by store translate |
| User language preference | localStorage | No durable User/Business locale SSOT |
| LLM locale | `localePrompt` | Separate from UI i18n; 5 locales |
| Conversation bilingual UX | — | Missing |
| Business glossary | Dashboard `i18n-glossary.json` (UI) | No per-store product glossary |
| Regional formatting | Ad hoc currency/date | No unified region profiles |

### 1.2 Critical process violation

`autoTranslateStore` replaces primary content fields instead of writing `translations[lang]`. This contradicts:

> Never overwrite the original. Translation is view layer only.

Phase 1 does **not** change that route. A later phase must migrate it behind Language Policy (write translations only) with an explicit impact report.

---

## 2. Proposed bounded context

```text
┌──────────────────────────────────────────────────────────────┐
│ Canonical Business Data                                      │
│  Product / Category / Policy / Message (source language)     │
│  Never mutated by translation                                │
└────────────────────────────┬─────────────────────────────────┘
                             │ understand (glossary + industry)
┌────────────────────────────▼─────────────────────────────────┐
│ Language Intelligence (new)                                  │
│  LanguageResolver → TranslationEngine → LocalizationEngine   │
│  RegionalAdapter · BusinessGlossary · TranslationMemory      │
│  ConversationTranslator · StorefrontLocalizer · Cache/Audit  │
└────────────────────────────┬─────────────────────────────────┘
                             │ project LocalizedView
┌────────────────────────────▼─────────────────────────────────┐
│ Surfaces (consumers only — no direct provider calls)         │
│  Storefront · Chat · Dashboard · AI · Email · Documents      │
└──────────────────────────────────────────────────────────────┘
```

**Placement:** `apps/core/cardbey-core/src/lib/languageIntelligence/`  
**Dashboard** remains owner of UI string catalogs; it consumes Core for content localization.  
**Existing** `services/i18n/*`, `localePrompt.js`, `services/language/*` become adapters — not deleted in Phase 1.

### 2.1 Module map (target architecture)

| Module | Phase | Responsibility |
|--------|-------|----------------|
| `LanguageResolver` | 1 | Preference chain → resolved locale/region |
| `LocaleService` / registries | 1 | Supported languages + region defaults |
| `RegionalFormatting` | 1 | Currency, units, dates, phone (pure) |
| `BusinessGlossary` (contracts + platform seed) | 1 | Do-not-translate / preferred terms |
| `CanonicalContent` / `TranslationRecord` | 1 | Contracts for original + view metadata |
| `DualLanguageRenderer` (contract + helpers) | 1 | original \| translated \| both |
| `LanguagePolicy` | 1 | Never overwrite; review gates by content class |
| `LanguageDetection` | 2 | Unify VI/en heuristics; expand scripts |
| `TranslationEngine` + `TranslationProvider` | 2 | Single AI translate path; confidence |
| `TranslationCache` / Memory | 2 | Per language × revision |
| `TranslationAudit` | 2 | History + review state |
| `ConversationTranslator` | 3 | WeChat-style chat views |
| `StorefrontLocalizer` | 3 | Project storefront LocalizedView |
| `LocalizationEngine` / cultural style | 4 | Regional AI behaviour |
| Durable preferences (User/Business) | 4 | Schema + API (fix Business.locale drift) |

---

## 3. Exact canonical contracts (Phase 1)

| Contract | Responsibility | Must not own |
|----------|----------------|--------------|
| `LanguageCode` | BCP-47 primary tag in supported set | Content text |
| `RegionProfile` | Default language, currency, date, units, style | Business facts |
| `UserLocalePreference` | Preferred language/region/currency/date/units | Resolution algorithm |
| `LanguageResolution` | Result + evidence of preference chain | Persistence |
| `CanonicalContentRef` | Source language + field pointers | Translated strings as authority |
| `TranslationRecord` | Target text, confidence, revision, provider, status | Overwriting source |
| `GlossaryEntry` | Term → preferred rendering / never-translate | Blind machine replace |
| `DualLanguageView` | Display mode + original + localized | Storage mutation |
| `TranslationPolicy` | Content class → review required? cacheable? | Provider credentials |

### 3.1 Language resolution order (locked)

1. Explicit request preference (query/header/body)  
2. Saved account preference  
3. Browser `Accept-Language`  
4. Device language hint  
5. Region default  
6. English fallback  

Manual selection always wins; never overridden by detection.

### 3.2 Supported languages (registry — extensible)

`vi`, `en`, `zh`, `ja`, `ko`, `th`, `fr`, `de`, `es`, `pt`, `ar`, `ru`  
Architecture: sealed registry + `registerLanguage` only at boot. Adding a language = definition row, not redesign.

### 3.3 Seed region profiles

| Region | Language | Currency | Date | Units | Style |
|--------|----------|----------|------|-------|-------|
| `VN` | vi | VND | dd/MM/yyyy | metric | polite |
| `AU` | en | AUD | dd/MM/yyyy | metric | friendly |
| `US` | en | USD | MM/dd/yyyy | imperial | direct |
| `JP` | ja | JPY | yyyy/MM/dd | metric | formal |
| `DE` | de | EUR | dd.MM.yyyy | metric | structured |

---

## 4. Non-goals (Phase 0–1)

- No Prisma migrations  
- No change to `autoTranslateStore` behavior  
- No dashboard i18n.js expansion to 12 languages  
- No conversation UX UI  
- No public storefront cutover  
- No new AI provider SDK  
- Language Intelligence is **never authoritative** until a dedicated cutover phase

---

## 5. Phased delivery

| Phase | Deliverable | Hot-path change |
|-------|-------------|-----------------|
| **0** | This plan | None |
| **1** | Contracts, registries, resolver, regional formatting, adapters, flags | None |
| **2** | TranslationEngine (writes `translations` only), cache, confidence, audit | Opt-in shadow APIs |
| **3** | ConversationTranslator + StorefrontLocalizer projection | Flagged consumers |
| **4** | Durable preferences + cultural style + glossary owner UI | Schema + governed APIs |
| **5** | Migrate/stop overwrite-translate; expand UI locales gradually | Process change — separate impact report |

---

## 6. Feature flags

| Flag | Meaning |
|------|---------|
| `ENABLE_LANGUAGE_INTELLIGENCE_V1` | Advisory diagnostics + resolver available |
| `isLanguageIntelligenceAuthoritative()` | Always `false` through Phase 4 |

Mirror in `Features.languageIntelligence.v1` + `snapshotFeatures()`.

---

## 7. Success criteria (platform — end state)

- One canonical business object; localized views only  
- Original never lost or overwritten  
- Users see preferred language via single resolution service  
- Storefronts adapt for international visitors  
- Cross-language conversation with View Original  
- Regional formatting consistent  
- Glossaries preserve brand/industry terms  
- All surfaces use Language Intelligence — no duplicate engines  

**Final design principle:** Language should never be a barrier to doing business. Cardbey preserves each business's authentic voice while making it understandable anywhere in the world.
