# Impact Report: DeepSeek API key integration fix

**Date:** 2026-08-10  
**Goal:** Stop 100% DeepSeek auth failures (fallback to Anthropic, 35s E2E) by fixing key/baseURL/model wiring — or cleanly skip DeepSeek when the key is invalid.

## What could break

1. **Provider routing** — skipping DeepSeek incorrectly could bypass a working primary.
2. **Model name change** — invalid `DEEPSEEK_MODEL` (e.g. `deepseek-v4-flash`) may 404 even with a valid key.
3. **Admin diagnostic** — must stay admin-only; must never return full API keys.

## Why

Harness showed DeepSeek primary `Connection error.` / auth failure on every call; Anthropic fallback succeeded. User curl confirms `Authentication Fails` for the key in use. Latency target (&lt;8s) cannot be met while every call pays DeepSeek fail + Anthropic success.

## Impact scope

- Core: `deepseek.config.ts`, LLM gateway / DeepSeek provider path, optional admin diagnostic, validation harness
- Process-local / Core deploy only (no dashboard required for skip-path)

## Root cause (confirmed)

`callDeepSeekChat` used `DEEPSEEK_ENDPOINT` (`http://localhost:8000/v1`) instead of `DEEPSEEK_BASE_URL` (`https://api.deepseek.com/v1`). Local server was down → “Connection error.” → 100% Anthropic fallback. The API key itself is valid against cloud (validation script HTTP 200).

## Smallest safe patch

1. Shared `deepseekEnv.ts`: prefer `DEEPSEEK_BASE_URL`; ignore localhost `DEEPSEEK_ENDPOINT`.
2. Reject local HF model ids (`deepseek-ai/...`) for cloud → `deepseek-v4-flash`.
3. Validation harness: `scripts/deepseekKeyValidation.mjs`.
4. Disable thinking mode for JSON `responseFormat` calls (prevents Planner max_tokens truncation).
5. Comment out localhost ENDPOINT in local `.env` (dev only).

## Governance

No publish/billing/customer messaging. Diagnostics redact secrets. Render: ensure `DEEPSEEK_ENDPOINT` is unset or not localhost.
