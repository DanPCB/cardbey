# Impact Report: DeepSeek config + multi-agent perf deploy

**Date:** 2026-08-10  
**Branch:** `fix/deepseek-config-perf-optimization` → `main` (Render auto-deploy)

## What could break

1. **Provider routing** — wrong base URL / model still causes DeepSeek miss → Anthropic fallback / higher latency.
2. **Plan quality** — shorter Planner/Critic prompts or lower `maxTokens` may drop edge-case steps or over-approve/reject.
3. **HITL volume** — Critic prompt tightening may change `approved` rates → more/fewer `pending_human_review`.
4. **Admin diagnostic** — must stay admin-only; must never return full API keys.

## Why

Local harness: DeepSeek key is valid; previous failure was localhost `DEEPSEEK_ENDPOINT`. After URL fix, primary works but Planner/Critic ~14s each (E2E ~31s). Deploy needs cloud URL preference + leaner JSON agents for &lt;8s target.

## Impact scope

- Core only: `deepseekEnv.ts`, `deepseekChat.ts`, `deepseek.config.ts`, `base.agent.ts`, Planner/Critic agents, admin diagnostic route, validation script
- Render env: ensure `DEEPSEEK_BASE_URL=https://api.deepseek.com/v1` and no localhost `DEEPSEEK_ENDPOINT`
- No dashboard / publish / billing / customer messaging

## Smallest safe patch

1. Prefer `DEEPSEEK_BASE_URL`; ignore localhost `DEEPSEEK_ENDPOINT`.
2. Sanitize HF-style model ids for cloud.
3. Disable thinking for JSON `responseFormat`.
4. Shorten Planner/Critic system prompts; lower per-agent token budgets.
5. Admin diagnostic: key prefix/length + live ping (no secret leak).
6. Do **not** invent new orchestrator “parallel pre-checks” (Planner→Critic is sequential by design; plan execution already uses `parallelLimit`).
7. Do **not** bundle unrelated WIP (observability Prisma, consultation booking, etc.).

## Rollback

- `DEEPSEEK_ENABLED=false` on Render, or revert the merge commit and redeploy.
