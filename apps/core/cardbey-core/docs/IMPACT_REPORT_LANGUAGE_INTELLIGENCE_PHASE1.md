# Impact Report — Language Intelligence Phase 1

**Date:** 2026-07-31  
**Scope:** Contracts + registries + language resolver + regional formatting + read-only adapters  
**Flag:** `ENABLE_LANGUAGE_INTELLIGENCE_V1`

## What could break

- Accidental import of Language Intelligence into store translate / public mappers that treat it as authoritative (mitigated: `isLanguageIntelligenceAuthoritative()` always `false`; no call sites wired into translate/publish/chat).
- Confusion between dashboard UI i18n (`en`/`vi` catalog) and content localization contracts (mitigated: separate bounded context; adapters document boundaries).
- Expanding `ALLOWED_LOCALES` in `localePrompt.js` by accident (mitigated: Phase 1 does **not** modify `localePrompt.js`; registry is parallel and wider).

## Why this change is safe

Phase 1 adds a **parallel advisory layer**. Existing UI i18n, `autoTranslateStore`, `getTranslatedField`, and LLM locale prompts remain the live paths. No Prisma migrations. No API route changes.

## Impact scope

| Area | Change |
|------|--------|
| Core translate / chat / publish | **None** |
| Dashboard i18n catalogs | **None** |
| Prisma / migrations | **None** |
| New module | `src/lib/languageIntelligence/**` |
| Features | `Features.languageIntelligence.v1` + `.env.example` note |

## Contracts introduced

- `LanguageCode` (12 languages + extensible registry)
- `RegionProfile` (VN, AU, US, JP, DE seeds)
- `UserLocalePreference`
- `LanguageResolution` (+ preference source evidence)
- `CanonicalContentRef` / `TranslationRecord` / confidence
- `GlossaryEntry` (never-translate / preferred term)
- `DualLanguageView` (`original` \| `translated` \| `both`)
- `TranslationPolicy` (content class → review / cache rules)

## Modules introduced

| Module | Role |
|--------|------|
| `LanguageResolver` | Deterministic preference chain |
| `RegionalFormatting` | Currency, date, units (pure) |
| `language` / `region` / `glossary` registries | Sealed at boot |
| Adapters | Bridge `localePrompt` + `translationUtils` (read-only) |

## Feature-flag behavior

| Env | Default when unset |
|-----|-------------------|
| Production | **off** |
| Staging / non-prod | **on** (diagnostics only) |
| Explicit `ENABLE_LANGUAGE_INTELLIGENCE_V1` | wins |

Even when **on**, `isLanguageIntelligenceAuthoritative()` is **false**.

## Deferred (process-changing — separate reports required)

1. Stop `autoTranslateStore` from overwriting primary fields.  
2. Durable `User.preferredLocale` / `Business.locale` schema.  
3. Conversation translate-on-read UX.  
4. Storefront automatic localization cutover.  
5. Expanding dashboard UI catalogs beyond en/vi.

## Rollback

- Set `ENABLE_LANGUAGE_INTELLIGENCE_V1=false`.  
- Delete or ignore the new module — no live path depends on it yet.

## Smallest safe patch (this phase)

Add `src/lib/languageIntelligence/**` + feature flag + tests. Zero hot-path wiring.
