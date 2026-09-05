# WAVE 0 — Release Closure Immediate Corrections

**Date:** 2026-09-04  
**Mission:** `CARDBEY_V1_STORE_CREATION_RELEASE_CLOSURE` Wave 0  
**Parent:** `docs/reports/CARDBEY_V1_STORE_CREATION_RELEASE_GAP_REGISTER.md`

---

## Verdict

| Task | Status |
|------|--------|
| W0.1 Flag pin audit + blueprint pins | **DONE** (repo pins; Render sync still required for live prod) |
| W0.2 OCR / vision resilience | **DONE on staging** (prior PR #339); unit tests green; prod promote still open |
| W0.3 Reveal refresh canary | **PASS** (staging full Day 4) |

**Wave 0 exit:** `WAVE_0_COMPLETE_PENDING_RENDER_SYNC`  
Core/paid release verdicts remain **BLOCKED** until Wave 1+ (cohort / HP full-chain / paid).

---

## W0.1 — Feature flag pins

### Observed truth (before)

| Flag | Staging (`render.yaml`) | Production (`render.yaml`) | Dashboard env files |
|------|-------------------------|----------------------------|---------------------|
| `ENABLE_STORE_RESEARCH_PIPELINE` | `1` | **missing** (default OFF in prod code) | n/a |
| Mission 001 fidelity/offering/grounding/gate | present | **missing** | n/a |
| `ENABLE_GROUNDED_STORE_CREATION_V1` | missing | missing | n/a |
| `PUBLISH_SNAPSHOT_V1` | **missing** | **missing** | n/a |
| `VITE_PUBLISH_SNAPSHOT_V1` | **missing** | **missing** | not set |

Local core `.env` already had research + `PUBLISH_SNAPSHOT_V1=true` (dev only).

### Changes applied

1. `apps/core/cardbey-core/render.yaml`
   - **Production `cardbey-core`:** research + Mission 001 subset + grounded + `PUBLISH_SNAPSHOT_V1=true`
   - **Staging `cardbey-core-staging`:** add grounded + `PUBLISH_SNAPSHOT_V1=true`
2. Dashboard `.env.staging` / `.env.production`: `VITE_PUBLISH_SNAPSHOT_V1=true` (local deploy templates; confirm Render dashboard env)
3. `.env.example` comments for core + dashboard publish snapshot

### Ops action still required

Blueprint sync / Render dashboard must apply these env vars and redeploy. Until then live production may still run with research/snapshot unset.

**Do not set secrets in git.** Confirm separately in Render:

- `ANTHROPIC_API_KEY` (OCR fallback #2 — proven on staging)
- `GOOGLE_CLOUD_VISION_ENABLED` + API key (optional tertiary)
- Stripe keys (customer journeys only; not Wave 0)

---

## W0.2 — OCR / vision

Already shipped to **staging** as Vision Provider Fallback V1:

- PRs [#338](https://github.com/DanPCB/cardbey/pull/338) / [#339](https://github.com/DanPCB/cardbey/pull/339)
- Doc: `docs/reports/VISION_PROVIDER_FALLBACK_V1.md`
- Chain: OpenAI → Anthropic → Google; `VISION_PROVIDERS_UNAVAILABLE` ≠ unreadable
- Local: `npx vitest run tests/ocrFallback.test.js` → **7/7 PASS** (2026-09-04)

**Remaining:** promote same Core tip to **production main** + one production HP extract canary (Wave 1 / production canary lane).

Classification update: staging **RESILIENT**; production **PARTIAL** until promote.

---

## W0.3 — Reveal refresh canary

Command:

```bash
node scripts/golden-path-day4-staging-verify.mjs --full
```

### Result (2026-09-04)

`CARDBEY_V1_GOLDEN_PATH_DAY4_RESULT_FIRST_REVEAL_READY`

| Check | Result |
|-------|--------|
| Day 4 bundle markers | PASS |
| MSD intake → create_store | PASS |
| Mission start + `structured_store_build` | PASS |
| Draft ready | PASS |
| `/preview/website/:draftId` HTTP 200 | PASS |
| Not edit-session dead-end | PASS |
| **Preview survives refresh** | **PASS** |

Example preview:  
`https://cardbey-dashboard-staging.onrender.com/preview/website/cmtlz0eq300eqmycxd9appnlx`

### Instrumentation fix

Canary previously missed `draftId`/`generationRunId` (they live on `state.outputs` / build step `output`). Script updated to read those fields and assert double-fetch refresh.

---

## Impact / risk

| Change | Risk | Mitigation |
|--------|------|------------|
| Enable research on production blueprint | Process change for create-store | Matches staging Mission 001 pins; fail-closed invention already proven |
| Enable publish snapshot on production | Publish path requires snapshot | Intended guarded path; verify after deploy with one publish canary |
| Dashboard `VITE_PUBLISH_SNAPSHOT_V1` | Client uses snapshot client | Must match core flag |

---

## Gap register updates

| Gap | Wave 0 effect |
|-----|----------------|
| RG-001 | Pins written; **live prod still VERIFY after Render sync** |
| RG-002 | Pins written; same |
| RG-005 | Staging mitigated; prod promote open |
| RG-012 | Staging refresh canary **PASS** |

---

## Next (Wave 1)

1. Sync/redeploy Render with Wave 0 pins  
2. HP Services full-chain canary  
3. Ambiguous/insufficient clarify proof  
4. Bounded ~12 create→publish cohort  
