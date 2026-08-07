# Impact Report — Language Intelligence Phase 3  
## Conversation Translator + Storefront Localizer

**Date:** 2026-07-31  
**Scope:** ConversationTranslator, StorefrontLocalizer, DualLanguageRenderer helpers, opt-in localize APIs  
**Depends on:** Phase 2 TranslationEngine (required)  
**Flags:** `ENABLE_LANGUAGE_INTELLIGENCE_CONVERSATION_V1`, `ENABLE_LANGUAGE_INTELLIGENCE_STOREFRONT_LOCALIZER_V1`

---

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Chat clients see unexpected payload keys | Enriching messages with `languageIntelligence` | Only via opt-in API / explicit enrich helpers; default GET agent-messages unchanged |
| Public storefront DTO shape drift | Attaching localize shadow on public mappers | Shadow helpers are separate; default `toPublicStore` / `toPublicProduct` unchanged |
| Extra OpenAI cost on chat read | Auto-translate every message | Engine cache + `autoTranslateConversation` opt-in; prefer existing `translations` for storefront |
| Latency on localize batch | Large conversations | Cap batch size; return partial + skipped |

## Why this is safe

Phase 3 is an **advisory presentation layer** on TranslationEngine. Stored `AgentMessage.content` / `ConversationMessage.content` / Product primary fields are **never mutated**. `isLanguageIntelligenceAuthoritative()` remains `false`.

## Impact scope

| Area | Change |
|------|--------|
| `languageIntelligence/conversation/**` | **New** |
| `languageIntelligence/storefront/**` | **New** |
| `languageIntelligence/dualLanguage/**` | **New** renderer helpers |
| `routes/i18n/languageIntelligenceLocalize.js` | **New** opt-in APIs |
| Default public store / agent-messages GET | **None** |
| Prisma | **None** |

## Smallest safe patch

1. Pure ConversationTranslator + StorefrontLocalizer using TranslationEngine only.  
2. DualLanguageRenderer: View Original / Translated / Both + attribution.  
3. Opt-in routes under `/api/language-intelligence/*` (auth required).  
4. No default wire into public storefront or SSE.

## Architectural flow

```text
Incoming / stored message (canonical)
       ↓
LanguageResolver (viewer preference)
       ↓
TranslationEngine.translate()   // contentClass: conversation
       ↓
TranslationRecord (cache/memory)
       ↓
DualLanguageView → DualLanguageRenderer
       ↓
UI: Translated · View Original · Translated by Cardbey AI
```

```text
Canonical Product
       ↓
readLocalizedField (translations JSON)  OR  TranslationEngine (if generate)
       ↓
Localized Product View + DualLanguageView
       ↓
Shadow / opt-in API only (Phase 3)
```

## Deferred

- Default enrich on GET `/api/agent-messages` and SSE  
- Default `?lang=` on all public store detail routes  
- Dashboard MessageRenderer “View Original” UI (consumes API next)  
- Phase 4 durable preferences  

## Rollback

Set conversation / storefront localizer flags `false`. Delete or ignore new modules + localize routes — no default path depends on them.

## Success criteria

- [x] ConversationTranslator via TranslationEngine only  
- [x] StorefrontLocalizer via translations layer + optional engine generate  
- [x] DualLanguageRenderer (original / translated / both + View Original hints)  
- [x] Auto-translate conversation preference honored when requested  
- [x] No canonical overwrite; authoritative remains false  

## Test results

```text
pnpm exec vitest run src/lib/languageIntelligence/__tests__/languageIntelligencePhase{1,2,3}.test.js
→ 36 passed (21 + 8 + 7)
```

## Opt-in APIs

| Method | Path |
|--------|------|
| POST | `/api/language-intelligence/localize-conversation` |
| POST | `/api/language-intelligence/localize-storefront` |
