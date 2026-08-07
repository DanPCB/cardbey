# Impact Report — Language Intelligence Phase 4  
## Preferences · Cultural Adaptation · Glossary Learning

**Date:** 2026-08-01  
**Scope:** Durable user/business locale preferences, regional AI behaviour/tone, store glossary learning  
**Flag:** `ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1`  
**Storage:** Existing JSON only — **no Prisma migration**

---

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| `AccountProfile.languages` shape change | Historically an array; we store `{ v, spoken, preference }` | Backward-compatible reader: arrays still work; identity resolver uses `spoken` |
| `stylePreferences` merge clobber | Writing LI block without merge | Deep-merge only `stylePreferences.languageIntelligence` |
| Cultural prompts alter LLM output | New instruction helpers | Opt-in; callers must pass through; not wired into intake by default |
| Glossary auto-learn noise | Heuristic proposals | Propose-only until owner approves |

## Why this is safe

- No schema migration  
- Preferences are additive JSON  
- Cultural adaptation is a **prompt helper**, not auto-applied to performer intake  
- Glossary learning requires owner approve before affecting translation  
- `isLanguageIntelligenceAuthoritative()` remains `false`

## Impact scope

| Area | Change |
|------|--------|
| `languageIntelligence/preferences/**` | **New** |
| `languageIntelligence/cultural/**` | **New** |
| `languageIntelligence/glossary/**` | **New** (store learning) |
| `accountProfileResolver.js` | Tiny: `languages` array **or** structured object → spoken list |
| Opt-in APIs under `/api/language-intelligence/*` | **New** preference/glossary routes |
| Default chat / public storefront / intake | **None** |

## Storage contract

**User** → `AccountProfile.languages`:
```json
{
  "v": 1,
  "spoken": ["vi", "en"],
  "preference": {
    "preferredLanguage": "vi",
    "preferredRegion": "VN",
    "preferredCurrency": "VND",
    "preferredDateFormat": "dd/MM/yyyy",
    "preferredMeasurementUnits": "metric",
    "manualLanguageSelection": true,
    "communicationStyleOverride": null
  }
}
```

**Business** → `stylePreferences.languageIntelligence`:
```json
{
  "locale": { "preferredLanguage": "vi", "preferredRegion": "VN", ... },
  "culturalStyle": "polite",
  "glossary": [ { "id", "term", "policy", "preferredByLanguage", "ownerApproved": true } ]
}
```

## Smallest safe patch

1. Preference read/write services + cultural prompt builder + glossary propose/approve.  
2. Backward-compatible languages reader in account identity.  
3. Flagged APIs; no intake/storefront cutover.

## Deferred

- Prisma columns `User.preferredLocale` / `Business.locale` (schema drift fix later)  
- Auto-wire cultural style into performer intake (Phase 5/6)  
- Cross-store translation memory (Phase 6)

## Rollback

Flag off + ignore new routes. Revert `languages` writes if needed (arrays still readable).

## Test results

```text
pnpm exec vitest run src/lib/languageIntelligence/__tests__/languageIntelligencePhase{1,2,3,4}.test.js
→ 45 passed
```

## Opt-in APIs

| Method | Path |
|--------|------|
| GET/PATCH | `/api/language-intelligence/preferences` |
| GET/PATCH | `/api/language-intelligence/business/:storeId/preferences` |
| GET | `/api/language-intelligence/business/:storeId/glossary` |
| POST | `/api/language-intelligence/business/:storeId/glossary/propose` |
| POST | `/api/language-intelligence/business/:storeId/glossary/approve` |
| GET | `/api/language-intelligence/cultural-style` |
