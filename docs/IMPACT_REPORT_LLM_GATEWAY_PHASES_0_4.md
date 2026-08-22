# Impact Report: LLM Gateway Phases 0–4 (Integrate, Don't Build)

**Date:** 2026-08-04  
**Status:** Ready for production (primary surfaces)  
**PR:** https://github.com/DanPCB/cardbey/pull/57 → staging; promote cherry-picks to `main` for prod  

---

## Summary

Phases 0–4 route the five primary surfaces through `llmGateway` with config-driven providers, PII redaction, and per-surface rollback flags. No intentional user-facing behavior changes.

| Phase | Change |
|-------|--------|
| 0 | Text generation defaults through `llmGateway` (`USE_LLM_GATEWAY`) |
| 1 | Kimi + Groq providers; `ENABLE_PII_REDACTION` |
| 2 | MultiAgent via gateway; unified intent taxonomy adapters |
| 3 | `analyzeVision` / `embed` / `generateImage` / `generateVideo` |
| 4 | Remove orphan `lib/llm/hybridRouter` + `cloudAdapter`; gateway-wrap `ai/engines` |

## Surfaces (default ON)

Performer Console, Assistant Chat, MultiAgent, RAG, MI vision extractors.

## Rollback

| Flag | Effect |
|------|--------|
| `USE_LLM_GATEWAY=false` | Full gateway off (direct SDK paths) |
| `MULTIAGENT_USE_GATEWAY=false` | MultiAgent direct path |
| `VISION_ENABLED=false` | Vision facade off |
| `EMBEDDING_ENABLED=false` | Embed facade off |
| `IMAGE_GEN_ENABLED=false` | Image facade off |
| `VIDEO_GEN_ENABLED=false` | Video facade off |
| `ENABLE_PII_REDACTION=false` | Skip redaction |
| `git revert` | Restore deleted llm hybrid files |

## Known gaps (non-blocking for primary surfaces)

- Secondary services may still call OpenAI/Anthropic directly
- `ai/engines` kept as deprecated gateway-backed facade (loyalty/OCR/templates)
- `lib/routing/hybridRouter` retained (unrelated governance router)

## Changelog

### Added
- Multimodal gateway: vision, embeddings (OpenAI/Voyage/Cohere), image (DALL·E/Ideogram/Recraft), video (OpenAI/Kling)
- `Features.llm.fallbackModel` / `LLM_FALLBACK_MODEL`
- Unified intent taxonomy adapters (`unifiedIntent`)

### Changed
- Primary surfaces + `ai/engines` text/vision/image route through gateway when enabled

### Removed
- `apps/core/cardbey-core/src/lib/llm/hybridRouter.js`
- `apps/core/cardbey-core/src/lib/llm/cloudAdapter.js`
