# IMPACT_REPORT — CTA Engine Phase 2C (Final Sign-off)

**Date:** 2026-07-27  
**Verdict:** `PHASE_2_COMPLETE`  
**Production readiness:** `READY_FOR_CONTROLLED_PRODUCTION_ENABLEMENT` (production flags remain **OFF**)

## Staging commits

| Component | SHA | Notes |
|-----------|-----|--------|
| Dashboard staging (flag-on geometry) | `6716a4b` | Overlay spacing matrix green on Render |
| Dashboard staging (flag-off rehearsal push) | `a853af7` | Repo set false; **Render dashboard env still forced `"true"`** |
| Dashboard staging (restored) | `4d94b0d` | `.env.staging` + render.yaml back to true |
| Core / monorepo staging | `704788024` (+ docs commit below) | CTA API live; `platformMarketingV1: true` |

## Need help overlap — RESOLVED

Shared contract: `bottomOverlayRegistry.ts` + `overlaySlots.ts` CSS vars (`--cardbey-overlay-*`).

| Viewport | Mode | Result |
|----------|------|--------|
| 320×568 | stack_orb_above | ok (vGap 12px) |
| 360×640 | stack_orb_above | ok |
| 390×844 | stack_orb_above | ok |
| 412×915 | side_by_side | ok (hGap ≥12px) |
| 375×667 | stack_orb_above | ok |
| 844×390 landscape | side_by_side | ok (hGap 12px) |

Evidence: `test-results/cta-phase2c-overlay/*.png` + `summary.json` (local agent run).  
No z-index escalation; orb reads registry vars via `performerOrbShellStyle`.

## Vite rollback — BROWSER_PROVED

| Build | Flag | Proof |
|-------|------|--------|
| Local `pnpm run build:staging` | `"false"` inlined | Dist served via `vite preview`; host **0**, hero **1** (`flag-off-local-rebuild.json`) |
| Staging Render after `a853af7` | Still `"true"` in bundle | Render **Environment** overrides `.env.staging` (Vite process.env wins) |

**Operational note:** Staging rollback on Render requires setting  
`VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=false` in the **Render dashboard** (or syncing blueprint), then rebuild — not git-only.

| Flag | Semantics |
|------|-----------|
| `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | **Build-time** — rebuild/redeploy required |
| `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | **Runtime** on core — restart/redeploy env |

## Auth next smoke — PASS

Playwright `tests/e2e/cta-engine-auth-next.spec.ts`: PROFILE_IDENTITY → login with `returnTo=` (and legacy `next=`) to `/app?entry=performer&intent=create_profile`. Open-redirect rejected by `sanitizeInternalReturnPath`. No checkout/auto-create. LoginPage accepts `next` as alias.

Duplicate execution: navigate-to-login only; no store draft created by CTA click.

## Bounded browser regression smoke — PASS

`tests/e2e/cta-engine-bounded-regression.spec.ts` (4/4):

- Home/feed: no `[data-cta-engine-platform]`
- Partner pass route: no host
- `/s/demo`: no `/api/cta/*` from renderer

Label: **bounded browser regression smoke** (not full E2E).

## Vitest / Playwright / Core

| Suite | Result |
|-------|--------|
| Dashboard `src/lib/ctaEngine` + orb layout | 31+ green (overlay registry included) |
| Playwright CTA mocked + auth + regression | **10/10** |
| Overlay viewport smoke (staging) | **6/6** |
| Core phase1 + phase2 + flags | **22/22** |
| Integration API (staging) | Live evaluate matrix still valid |

## Analytics

**EMITTED_ONLY** — unchanged.

## GitHub Build Artifact — PROVEN_UNRELATED

| Job | Error | Relation to CTA |
|-----|--------|-----------------|
| Build dashboard image | Submodule clone 404 for private dashboard repo (token/App auth) | Pre-existing CI credentials |
| Build core image | `buildx` cache export unsupported on docker driver | Pre-existing workflow config |

Orphan gitlinks (`.development-workspaces/*`, `llama.cpp`) cleaned earlier; current failures are auth/docker — **not** CTA Engine. Render deploy path remains green.

## Production flags — OFF_CONFIRMED

- Production dashboard `render.yaml`: Vite CTA flag **not** set  
- Core production: no `CARDEY_DEPLOY_ENV=staging`; unset → platform marketing **off**  
- Strict parse tests cover undefined/true/false/"true"/"false"/"1"/"0"

## Rollback procedure

1. **Frontend:** Set `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=false` in the deploy environment that Vite reads (Render dashboard for staging/prod), rebuild, redeploy, hard-refresh / block SW.  
2. **API:** Set `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=false` on core (runtime) → `404 PLATFORM_MARKETING_CTA_DISABLED`.  
3. Hero Start with AI unchanged.

## Remaining non-blocking risks

1. Render dashboard env can override committed `.env.staging` — operators must know.  
2. Full auth login with real staging credentials (post-login resume) not exercised end-to-end with a live account in this session — redirect URL shape proved.  
3. GH Build Artifact still red for unrelated reasons — track separately.  
4. 200% text zoom not automated (manual follow-up).

## Recommended next phase

Controlled production enablement checklist (separate change), then Phase 3 storefront chrome migration **only after** explicit approval.
