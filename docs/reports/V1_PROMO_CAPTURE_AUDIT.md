# V1 Promo Capture Audit — Golden Path Recording Mode

**Date:** 2026-08-30  
**Scope:** Staging screen-recording readiness for a 25–30s V1 Golden Path promo (real product, no demo app, no fake backend).

---

## Executive summary

Staging can support the intended promo story **once `cardbey-core-staging` is healthy**. Dashboard entry convergence is live; Day 3 intelligence-first intake passes URL and description cases on core when API is up. **Market Lane Coffee** remains the strongest grounded capture case (24 research offerings, zero template fallback — Day 1 live proof). **Core staging returned HTTP 502 during this audit window**, which blocks live end-to-end verification until Render recovers.

**Recording mode:** PARTIAL — path is real and documented; core availability and ~60–90s build latency are the main operational risks.

---

## 1. Exact route to start recording

| Step | URL / action |
|------|----------------|
| **Global Front (recommended open)** | `https://cardbey-dashboard-staging.onrender.com/` |
| **Primary CTA** | Header **Create Your Business** (`data-testid="global-create-your-business"`) or mobile **Create** FAB → sheet → **Create Your Business** (`data-testid="create-action-create_store"`) |
| **Canonical Performer entry (auto-navigated)** | `/app?entry=performer&onboarding=1&newStore=1&starter=create_store&source=<source>` |
| **Source tags in bundle** | `global_create_launcher`, `public_header`, `explore_create_store`, etc. |

**Builder:** `createStoreEntryRoute()` in `apps/dashboard/cardbey-marketing-dashboard/src/routes/paths.ts`.

**Auto-dispatch:** `ConsoleCentreColumn.tsx` consumes `newStore=1` → `beginNewStoreCreation()` which sends intake `"Create a store for my business"` with `primaryMode: create`.

**Pre-recording checklist:**
- Use **staging only** (Mission 001 research flags not on production `main`).
- Clear `localStorage.cardbey.performerRuntimeDebug` (must not be `true`).
- Guest session is fine; sign-in not required for create-store runway.
- Allow **60–120 seconds** for research + `structured_store_build` to complete.

---

## 2. Recommended capture business

| Business | Input for recording | Research quality | Promo fit |
|----------|---------------------|------------------|-----------|
| **Market Lane Coffee** (primary) | After auto-intake, submit form path **or** type `https://www.marketlane.com.au` with location context | **24/24 `catalogSource: research`**, 0 template (Day 1 gate) | Strong identity, café catalog, Melbourne location, hero imagery |
| **Modern Security Doors** (URL-only alt) | `modernsecuritydoors.com.au` | Day 3 URL intake PASS; fixture-rich in tests; **live full-pipeline proof not re-run** (core 502) | Better for “one URL” promo shot; verify draft quality with `--full` before recording |

**Recommendation:** Record **Market Lane Coffee** for the draft reveal (16–22s). Use **MSD URL** or **Vietnam factory description** for the intake close-up (6–10s) if you want intelligence-first copy without a form.

**Do not use:** Pre-seeded demo stores, template fallback businesses, or hardcoded MSD content in UI.

---

## 3. Expected intake input

| Promo copy | Real input | API behavior (staging, Day 3) |
|------------|------------|-------------------------------|
| “Tell me about your business” (editor VO) | `modernsecuritydoors.com.au` | `action: create_store`, no location/category block |
| Alternative narrative | `I run a packaging factory in Vietnam and want customers in Australia.` | `action: create_store` |
| Grounded reveal path | Market Lane form: name + `https://www.marketlane.com.au` + Melbourne | `action: store_mission_started` |

**Note:** Bare `Market Lane Coffee` (name-only) returned `action: chat` in Day 3 smoke — **avoid for recording** unless re-tested after deploy. Prefer URL or full form.

**Visible intake copy today:** Auto-message is *“Create a store for my business”*; onboarding i18n uses *“Tell us about your business”* on legacy wizard strings. Editor can voice *“Tell me about your business”* over the composer — no code change required.

---

## 4. Expected transition states (real runtime)

Progress labels map to **real pipeline tools** (presentation only; no fake completion):

| User-facing label | Real pipeline stage(s) |
|-------------------|-------------------------|
| Understanding your business | `validate-context`, `validate_store_context`, `validate_store_input` |
| Finding your products & services | `market_research`, `prepare_catalog`, `validate_products` |
| Learning your brand | `analyze_store`, `upload_logo`, `capture_requirements` |
| Preparing your Cardbey presence | `structured_store_build`, `create_store` / `finalize_store` |

**Where shown:** Performer chat plan steps (`humanizePlanStepTitle`), execution activity rows (`STEP_LABEL_MAP`), natural progress messages (`naturalProgressMessageForTool`).

**Must NOT appear on screen:** `Mission 001`, `structured_store_build`, `URI`, checkpoint internal names, `catalogSource`, agent jargon. `ResearchDebugger` (shows `catalogSource`) is now **debug-gated** (`cardbey.performerRuntimeDebug`).

---

## 5. Final draft / result route

| Surface | Route | When |
|---------|-------|------|
| Performer execution panel | `/app` (inline preview / artifacts) | During and after build |
| Store draft review | `/app/store/draft/review` or `/app/store/temp/review` | Guest-safe review |
| Website preview | `/preview/website/:draftId` | Hero + About + catalog |
| Business space | `/space/:spaceId` | If store already materialized |

**Day 4 not shipped:** No automatic post-create redirect to space/preview. End recording in **Performer + inline preview** or navigate manually to `/preview/website/:draftId`.

**Brand assets checkpoint:** Pipeline may end `awaiting_input` / `blocked_on_checkpoint` after build. For promo: choose **Skip for now** on logo/brand checkpoint — draft is already reviewable.

---

## 6. UI obstructions for recording

| Issue | Severity | Mitigation |
|-------|----------|------------|
| Core staging 502 / cold start | **Blocker** | Wait for Render health; run `node scripts/v1-promo-capture-check.mjs --full` |
| ~60–120s build time | Timing | Pre-roll progress B-roll; trim in edit; do not fake progress |
| Brand assets checkpoint | Medium | Skip for now on camera |
| Guest signup banner in execution panel | Low | Crop or use logged-in account |
| Legacy onboarding wizard strings | Low | `newStore=1` bypasses multi-step wizard |
| Debug mode | High if on | Clear `cardbey.performerRuntimeDebug` |
| Name-only intake → `chat` | Medium | Use URL or form path for Market Lane |
| No Day 4 result CTAs | Expected | Use post-production overlay for Publish / Share (22–26s) |

**Cosmetic issues:** Not addressed in this audit (per task scope).

---

## 7. Approximate real runtime duration

| Phase | Duration (observed / expected) |
|-------|--------------------------------|
| Global Front → Performer entry | 2–4s |
| Intake message + user input | 3–5s (on camera) |
| Research + `structured_store_build` | **60–120s** (Day 1 staging; mission poll timeout at 120s in verify script) |
| Draft reveal ready | Immediately after build completes |
| Optional checkpoint skip | 3–5s |

**Total product time:** ~70–130s wall clock; promo edit uses **10–16s** of progress footage (may be sped 1.5–2× in post).

---

## 8. Staging verification snapshot (this audit)

| Check | Result |
|-------|--------|
| Dashboard `/` HTTP 200 | PASS |
| `Create Your Business` in bundle | PASS |
| Canonical `newStore` entry in bundle | PASS |
| Day 3 URL intake `modernsecuritydoors.com.au` | PASS (when core up) |
| Day 3 description intake | PASS |
| Day 3 name-only `Market Lane Coffee` | FAIL (`chat`) |
| Core `/api/health` | **FAIL (502)** at audit time |
| Full Market Lane mission + draft poll | Not completed (core down) |

---

## 9. Recording selectors (stable)

| Element | Selector |
|---------|----------|
| Header Create Your Business | `[data-testid="global-create-your-business"]` |
| Global Create launcher | `[data-testid="global-create-launcher-header"]` |
| Create sheet — Create Your Business | `[data-testid="create-action-create_store"]` |
| Performer composer | `#execution-mission-composer` (execution panel) |

---

## 10. Pre-record command

```bash
# From cardbey-core-staging Render shell (cwd = apps/core/cardbey-core):
node scripts/v1-promo-capture-check.mjs
node scripts/v1-promo-capture-check.mjs --full

# From local monorepo root:
node scripts/v1-promo-capture-check.mjs --full

# Optional env overrides:
# CORE_STAGING_URL=http://127.0.0.1:$PORT  (auto when PORT is set on Render)
# DASHBOARD_STAGING_URL=https://cardbey-dashboard-staging.onrender.com
```

**Note:** Script must be on the deployed `staging` branch (`apps/core/cardbey-core/scripts/v1-promo-capture-check.mjs`). It is not present on older deploys until merged and redeployed.

---

## Related gates

- `docs/reports/GOLDEN_PATH_DAY1_GATE.md` — Market Lane live proof
- `docs/reports/GOLDEN_PATH_DAY2_GATE.md` — entry convergence
- `docs/reports/GOLDEN_PATH_DAY3_GATE.md` — intelligence-first intake (live partial)
