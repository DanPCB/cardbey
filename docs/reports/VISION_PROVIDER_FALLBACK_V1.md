# VISION PROVIDER FALLBACK V1

**Date:** 2026-09-03  
**Mission:** OCR / Vision provider fallback resilience for Golden Path extract-card  
**Verdict:** `VISION_PROVIDER_FALLBACK_V1_READY_FOR_PRODUCTION_CANARY`

Deployed staging Core tip: `9104f6456` (includes `c4de8e316` + `9ddc29383`)  
PRs: [#338](https://github.com/DanPCB/cardbey/pull/338), [#339](https://github.com/DanPCB/cardbey/pull/339) → `staging`

---

## CURRENT PROVIDER CHAIN

```
POST /api/missions/extract-card
  → extractTextWithFallback
       1. openai_vision
       2. anthropic_vision
       3. google_vision (if configured)
  → classification + bounded attempts[]
  → parseBusinessCardOCR
  → approval / Store Creation
```

## ROOT FAILURE (fixed)

OpenAI quota/429 previously collapsed to empty OCR → user-facing unreadable/`OCR_WEAK`.  
Now classified and falls back sequentially; all-infra failure returns **503** `VISION_PROVIDERS_UNAVAILABLE`.

## STAGING CANARY MATRIX (recorded)

| Run | Core SHA | Sequence | Classification | businessName | Notes |
|-----|----------|----------|----------------|--------------|-------|
| Staging primary | `9104f6456` | openai `QUOTA_EXHAUSTED` → anthropic `SUCCESS` | SUCCESS | **HP Services** | Google not called; real OpenAI quota |
| Staging force-primary | `9104f6456` | openai `QUOTA_EXHAUSTED` (forced, 0ms) → anthropic `SUCCESS` | SUCCESS | **HP Services** | `ocrCanaryForcePrimary=quota` |
| Local secondary-fail (Anthropic off, Google unset) | local | openai forced → unavailable | **VISION_PROVIDERS_UNAVAILABLE** HTTP 503 | null | Honest recovery message; not OCR_WEAK |
| Regression name create | local/staging-eq | n/a | n/a | Melbourne Test Cafe path | intake `create_store` OK |
| Regression URL create | local `:3001` | n/a | n/a | Example | intake `create_store` OK |
| Create checkpoint from extracted name | staging | n/a | n/a | HP Services | `canProceedToCheckpoint=true` / “Ready to create…” |

Evidence JSON: `docs/reports/evidence/vision-fallback-*.json` and `apps/docs/reports/evidence/vision-fallback-canary-*.json`.

### What was **not** completed in this pass

- Browser Performer: Approve → full research/create → **Draft Preview URL** (confirm turn lost mission continuity over API-only confirm).
- Production HP Services canary (blocked until production deploy + explicit go).

Therefore: **READY_FOR_PRODUCTION_CANARY**, not full `READY`.

## FILES / ENV

See prior sections + `apps/core/cardbey-core/docs/OCR_FALLBACK.md`.  
Canary hook: body `ocrCanaryForcePrimary` only when staging / `ALLOW_OCR_CANARY_FORCE`.

## What happens if…

| Scenario | Behavior |
|----------|----------|
| OpenAI no credit | Fallback Anthropic (proven staging) |
| Anthropic also fails + Google off | 503 `VISION_PROVIDERS_UNAVAILABLE` (proven local) |
| Google not configured | Skipped |
| Image unreadable after providers | `UNREADABLE` (unit-tested) |

## UNIT TESTS

42 passed (`ocrFallback`, `ocrProviderFailure`, HP parser ranking).

## PRODUCTION NEXT

1. Promote same Core commits to `main` as **isolated** OCR resilience release.  
2. One production HP Services canary (extract → approval → create → preview).  
3. Then declare `VISION_PROVIDER_FALLBACK_V1_READY`.
