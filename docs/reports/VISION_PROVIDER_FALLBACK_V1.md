# VISION PROVIDER FALLBACK V1

**Date:** 2026-09-03  
**Mission:** OCR / Vision provider fallback resilience for Golden Path extract-card  
**Verdict:** `VISION_PROVIDER_FALLBACK_V1_PARTIAL`

---

## CURRENT PROVIDER CHAIN (after change)

```
POST /api/missions/extract-card
  → extractTextWithFallback (ocrFallback.js)
       1. openai_vision     (OPENAI_API_KEY)
       2. anthropic_vision  (ANTHROPIC_API_KEY, not disabled)
       3. google_vision     (GOOGLE_CLOUD_VISION_ENABLED + API key)
  → classification SUCCESS | UNREADABLE | VISION_PROVIDERS_UNAVAILABLE | …
  → parseBusinessCardOCR (unchanged ownership)
  → approval / Store Creation
```

## ROOT FAILURE (before)

OpenAI 429 / `credit_balance_exhausted` was caught in `ocrFallback`, converted to
**empty text**, then extract-card treated it as unreadable / loyalty `OCR_WEAK`
(confidence framed as user/image failure). Anthropic ran only on **refusal**
inside `runOcr`, not on quota/timeout. Google was opt-in and skipped Anthropic.

## EXISTING ADAPTERS REUSED

| Provider | Adapter | Notes |
|----------|---------|-------|
| OpenAI | `openaiVisionEngine` / `ocrProvider.js` | Primary |
| Anthropic | `postAnthropicMessages` + `runAnthropicOcrFallback` | Model via `resolveAnthropicModel()` |
| Google | `googleVisionOcr.js` DOCUMENT_TEXT_DETECTION | Optional tertiary |

No parallel OCR subsystem. No provider-specific business parsers.

## FILES CHANGED

| File | Change |
|------|--------|
| `src/lib/ocr/ocrProviderFailure.js` | **New** — classification |
| `src/lib/ocr/ocrProviderHealth.js` | **New** — short TTL skip after quota |
| `src/lib/ocr/ocrResilienceTelemetry.js` | **New** — attempt logs |
| `src/lib/ocr/ocrFallback.js` | Sequential OpenAI → Anthropic → Google |
| `src/modules/vision/runOcr.js` | Export Anthropic OCR; business_card refuses defer to orchestrator |
| `src/routes/missionsRoutes.js` | extract-card **503** for `VISION_PROVIDERS_UNAVAILABLE` |
| `src/lib/intake/extractCardLoyaltySoft.js` | Empty OCR alone ≠ loyalty soft |
| `src/lib/businessCardParser.js` | Demote trade taglines (HP Services) |
| `tests/ocrFallback.test.js` | Cases A–G |
| `tests/ocrProviderFailure.test.js` | Classifier unit tests |
| `tests/businessCardParser.test.js` | HP Services ranking |
| `docs/OCR_FALLBACK.md` | Corrected ownership |

## ERROR CLASSIFICATION

`SUCCESS` · `UNREADABLE` · `REFUSED` · `QUOTA_EXHAUSTED` · `RATE_LIMITED` ·
`TIMEOUT` · `NETWORK_ERROR` · `PROVIDER_ERROR` · `NOT_CONFIGURED` ·
`EMPTY_RESULT` · `VISION_PROVIDERS_UNAVAILABLE`

## FINAL FALLBACK ORDER

1. OpenAI (if key present and not TTL-blocked)  
2. Anthropic (if configured)  
3. Google Vision (if enabled + key)  
4. Honest recovery

## What happens if…

| Scenario | Behavior |
|----------|----------|
| OpenAI has no credit | `QUOTA_EXHAUSTED` → Anthropic → Google → or 503 `VISION_PROVIDERS_UNAVAILABLE` |
| Anthropic also fails | Continue to Google if configured; else 503 if all infra |
| Google not configured | Skipped; chain ends after Anthropic |
| Image genuinely unreadable | Providers return empty/weak → `UNREADABLE` → clearer-image / name prompt (502), **not** silent OCR_WEAK from empty infra |

## ENVIRONMENT REQUIREMENTS

See table in `apps/core/cardbey-core/docs/OCR_FALLBACK.md`.  
Do not commit credentials. Optional providers must not block Core boot.

## UNIT TESTS

- `tests/ocrFallback.test.js` — A–G (sequential, skip, unavailable, unreadable)  
- `tests/ocrProviderFailure.test.js`  
- `tests/businessCardParser.test.js` — HP Services over heating/cooling tagline  

**Result:** 42 passed in this suite run.

## INTEGRATION / STAGING / HP CANARY

| Gate | Status |
|------|--------|
| Unit orchestration | PASS |
| Core extract-card live with forced OpenAI quota | **Not run in this pass** |
| Staging browser HP Services → approval | **Not run** |
| Production enablement | **Blocked** until staging canary |

## HP SERVICES RESULT (parser)

With OCR text containing `HP Services` + `HEATING & COOLING & ELECTRICAL`,
parser prefers **HP Services** (tagline demotion). Live card upload still needs
staging canary.

## PRODUCTION READINESS

Not ready for “enable new provider in production” claims without staging proof.
Code is safe to deploy: optional Anthropic/Google remain skippable; 503 is
honest when all configured providers fail.

---

## FIRST FAILING BOUNDARY (PARTIAL)

**Staging / browser canary** — HP Services upload → fallback proof in logs →
approval → Create Store not executed in this session.

Until that passes: `VISION_PROVIDER_FALLBACK_V1_PARTIAL`.
