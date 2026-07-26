# IMPACT_REPORT — CTA Engine Phase 2B (Validation)

**Date:** 2026-07-26  
**Verdict:** PHASE_2_PARTIAL (harness + Playwright local green; staging browser smoke pending deploy)

## Vitest harness

| Field | Value |
|-------|--------|
| Status | **FIXED** |
| Root cause | `@testing-library/jest-dom@6.9` entry `@testing-library/jest-dom/vitest` + Vitest **1.6.1** leaves `expect.getState().testPath` as a getter-only field; runner throws on every test |
| Reproduction | Bare config (no setup) passes; setup with `/vitest` alone fails; `expect.extend(matchers)` passes |
| Fix | `src/test/setup.ts` uses `import * as matchers from '@testing-library/jest-dom/matchers'` + `expect.extend(matchers)` |
| Canonical command | `pnpm exec vitest run` (package dir) |
| Results | CTA suite + `businessEntryRouting` + isolation: **pass** (31+ tests in CTA folder group) |

## Playwright

| Field | Value |
|-------|--------|
| Mocked API | **PASS** — 5/5 `tests/e2e/cta-engine-platform-marketing.spec.ts` |
| Integration API | **NOT_RUN** — requires staging/core with `/api/cta/*` deployed |

## API race protection

`evaluateRaceGuard.ts` — generation token + AbortSignal; older STORE_CREATION cannot replace newer LOYALTY. Unit tests pass.

## Flag semantics

| Flag | Type | Production default |
|------|------|--------------------|
| `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | Core **runtime** | off |
| `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | Dashboard **build-time** | off (rebuild to change) |

Strict parsing tests: undefined / true / false / "true" / "false" / "1" / "0" / arbitrary string.

## Staging / mobile / rollback

Pending operator deploy using `docs/CTA_ENGINE_PHASE_2_STAGING_RUNBOOK.md`. Local evidence only until staging URLs + screenshots attached.

## Analytics

**EMITTED_ONLY** — impression dedupe by capability:variant; no durable warehouse claim.

## Regression evidence

Code-path isolation tests (`phase2Isolation.regression.test.ts`) — storefront/feed/PIL/Partner Pass do not import Phase 2 host/API. **Non-E2E.**

## Recommended next

1. Deploy staging per runbook + attach screenshots  
2. Integration Playwright against staging API (no mock)  
3. Then Phase 3 storefront chrome migration  
