# Impact Report — Language Intelligence Phase 2  
## Milestone: `LANGUAGE_INTELLIGENCE_PHASE2_TRANSLATION_ENGINE_COMPLETE`

**Date:** 2026-07-31  
**Scope:** TranslationEngine + Memory + Cache + Audit + Confidence + Provider abstraction + overwrite-translate elimination  
**Flags:** `ENABLE_LANGUAGE_INTELLIGENCE_V1`, `ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1`

---

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Store translate no longer changes visible primary `name`/`description` | Route previously **overwrote** canonical fields; after fix, UI that reads only primary columns (ignoring `?lang=` / `translations`) will keep showing original | Correct: public mappers already use `getTranslatedField`. Owner UI must pass target lang to see localized view. Document in API response. |
| Clients expecting primary fields to become Vietnamese after translate | Same root cause | Response adds `mode: "translations_layer"` + `canonicalPreserved: true` |
| OpenAI batch shape / latency unchanged but persistence path changes | Prisma updates `{ translations }` only | Unit + route-level tests with mocked provider |
| `editArtifact` translate-by-instruction still patches primary columns | Secondary path; not exclusive translate API | Documented deferred; not changed in Phase 2 (separate impact if wired) |

## Why this change is necessary

Phase 1 established contracts but **no canonical translation pipeline**. The live `POST /api/stores/:storeId/translate` path violates the core principle (never overwrite original). Conversation/storefront localization cannot safely land until one engine owns all translation writes.

## Impact scope

| Area | Change |
|------|--------|
| `src/lib/languageIntelligence/engine/**` | **New** — TranslationEngine, Memory, Cache, Audit, Confidence, Providers |
| `routes/i18n/autoTranslateStore.ts` | **Process fix** — write `translations` JSON only; never primary fields |
| `services/i18n/aiTranslationService.ts` | Thin provider adapter; accept any Language Intelligence language code for prompts |
| Dashboard `StoreTranslationsSection` | No required change (same endpoint); copy may say “existing translations overwritten” meaning **layer**, not canonical |
| Prisma schema | **None** (`translations Json?` already exists) |
| Chat / storefront / UI i18n catalogs | **None** |

## Smallest safe patch

1. Add engine modules behind `ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1` (default: follows V1 non-prod pattern).  
2. **Always** eliminate overwrite in `autoTranslateStore` (bug fix, not optional).  
3. Route calls `translateCatalogViaEngine` → persists only `setTranslatedFields` / engine patches.  
4. Tests: cache key × revision, never-overwrite assertion, engine batch with stub provider.

## Architectural rule (locked)

```text
Canonical Product
       ↓
TranslationEngine.translate()
       ↓
TranslationRecord (+ Memory / Cache / Audit)
       ↓
Localized View  (getTranslatedField / DualLanguageView)
```

**Nothing modifies canonical content for language reasons.**

## Deferred (not Phase 2)

- ConversationTranslator / StorefrontLocalizer (Phase 3)  
- Durable User/Business locale preferences (Phase 4)  
- `editArtifact` translate-instruction → translations layer (follow-up impact report)  
- Expanding dashboard UI chrome catalogs beyond en/vi (Phase 5)

## Rollback

- Engine flag off: diagnostics hide engine; route still uses `translationUtils.setTranslatedFields` (no overwrite).  
- Full revert of route: restore previous file from git (would reintroduce overwrite — not recommended).

## Success criteria (milestone)

- [x] Central TranslationEngine  
- [x] TranslationMemory / Cache / Audit / ConfidenceEngine  
- [x] Provider abstraction  
- [x] Revision tracking + TranslationRecords  
- [x] Overwrite-translate eliminated from store translate path  
- [x] `isLanguageIntelligenceAuthoritative()` remains false for unrelated cutovers  

## Test results

```text
pnpm exec vitest run src/lib/languageIntelligence/__tests__/languageIntelligencePhase1.test.js \
  src/lib/languageIntelligence/__tests__/languageIntelligencePhase2.test.js
→ 29 passed (21 Phase 1 + 8 Phase 2)
```

## Milestone status

**LANGUAGE_INTELLIGENCE_PHASE2_TRANSLATION_ENGINE_COMPLETE** — delivered on this branch (Phase 1 restored from checkpoint + Phase 2 engine + route fix).
