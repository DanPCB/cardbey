# Golden Path Day 1 Gate

## Verdict

**CARDBEY_V1_GOLDEN_PATH_DAY1_PARTIAL**

Code fixes and staging flag configuration are complete and tested locally. Live `cardbey-core-staging` has **not** been redeployed with the Day 1 flag bundle yet, so the scripted create-store proof below uses the **identical flag snapshot** locally (not the currently running Render service).

## Scope Completed

### 1. Mission 001 staging flags

| Flag | Previous (staging render.yaml) | New staging value | Effective runtime (with bundle) | Dependency |
|------|-------------------------------|-------------------|----------------------------------|------------|
| `ENABLE_MISSION_001_STORE_FIDELITY_V1` | unset (OFF) | `1` | ON | **Master** — required for all Mission 001 subflags |
| `ENABLE_MISSION_001_OFFERING_RECONSTRUCTION_V1` | unset | `1` | ON | Subflag; requires master |
| `ENABLE_STORE_RESEARCH_PIPELINE` | unset (defaults ON in non-prod) | `1` | ON | Independent; explicit for staging observability |
| `ENABLE_MISSION_001_GROUNDING_V1` | unset | `1` | ON | Subflag; default ON when master ON |
| `ENABLE_MISSION_001_FIDELITY_GATE_V1` | unset | `1` | ON | Subflag; default ON when master ON |
| `ENABLE_MISSION_001_PIPELINE_TIMING_V1` | unset | `1` | ON | Subflag; default ON when master ON |

**Production (`cardbey-core` service in `render.yaml`): NOT changed.**

Subflag graph (`mission001Flags.js`): when master is OFF, all subflags are OFF regardless of env. When master is ON, subflags default ON unless explicitly set to `0`/`false`/`off`.

### 2. Ask→Create fix

- **Root cause:** `resolveIntakeShortcutContext()` returned early on `clarify_create_runway` from `detectIntent()` and never consulted `resolveCreateStoreShortcut()` / `matchCreateStoreIntent()`, so clear create phrases that missed the runway regex (e.g. typo-normalized or contract-only matches) dead-ended in generic runway clarification.
- **Files changed:**
  - `apps/core/cardbey-core/src/lib/intake/intakeShortcutContext.js`
  - `apps/core/cardbey-core/src/lib/intent/storeCreateFastPath.js` (honor `primaryModeHint`)
  - `apps/core/cardbey-core/src/lib/intake/__tests__/intakeShortcutContext.test.js`
- **Before:** `primaryMode: create` + clear create phrase → `clarify_create_runway` when runway classifier returned no `intentMode` (even if create-store contract matched).
- **After:** Non-ambiguous clarify paths are upgraded to `create_store` when the canonical create-store contract matches; genuinely ambiguous dual-runway requests still clarify.
- **Regression coverage:** `intakeShortcutContext.test.js` — clear intents, ambiguous dual-runway, typo recovery (`creat my business`).

### 3. Video runtime fix

- **Root cause:** `isVideoOwnedByCreativeFactory` was referenced by factory routing but not exported from `createVideoOntology.js`; dynamic import paths could resolve `undefined` at runtime.
- **Files changed:**
  - `apps/core/cardbey-core/src/lib/intake/createVideoOntology.js`
  - `apps/core/cardbey-core/src/lib/factoryRuntime/factoryIntentRouter.js` (static import + skip UAF for Factory-owned video turns)
  - `apps/core/cardbey-core/src/lib/intake/__tests__/createVideoOntology.test.js`
- **Before error:** `isVideoOwnedByCreativeFactory is not a function`
- **After:** Helper resolves to a function; video tool labels and ontology-matched promotional video phrases return `true`; incidental “video” mentions return `false`.
- **Regression coverage:** `createVideoOntology.test.js`, `factoryIntentRouter.test.js`.

## Scripted Store Creation Evidence

| Field | Value |
|-------|-------|
| **Input** | Business: `Market Lane Coffee`, Website: `https://www.marketlane.com.au` (Mission 001 `cafe-strong-web` fixture) |
| **Environment** | Local core with Day 1 flag snapshot (`ENABLE_MISSION_001_*` + `ENABLE_STORE_RESEARCH_PIPELINE=1`, `NODE_ENV=staging`) |
| **Canonical path** | `runStoreCreationResearch` → structured catalog extract |
| **Research source** | Ran (`SERVICE_CATALOG_EXTRACTED`, 24 items) |
| **Catalog source / provenance** | `catalogAuthoritySource: STRUCTURED_CATALOG`, `fallbackToGenerated: false` |
| **Reconstruction** | Offering reconstruction not triggered for this fixture (`offeringReconstruction: null`); pipeline supports it when master + subflag ON |
| **Draft result** | 24 grounded catalog items (sample: Wholesale, Coffee, Equipment) |
| **Timing** | ~755 ms end-to-end for research step |

**Note:** Live `https://cardbey-core-staging.onrender.com` health check OK; Mission 001 master flag not yet active on running staging until this branch deploys.

## Ask→Create Evidence

| Message | Expected | Result |
|---------|----------|--------|
| `create my business` | `create_store` | PASS |
| `create my store` | `create_store` | PASS |
| `I want to create a business` | `create_store` | PASS |
| `help me create my business` | `create_store` | PASS |
| `creat my business` (typo) | `create_store` | PASS |
| `create a store and a mini website` | `clarify_create_runway` | PASS |
| `Help me get started` (frontscreen create) | `clarify_create_runway` via `detectIntent` | PASS |

## Video Evidence

```
typeof isVideoOwnedByCreativeFactory → "function"
isVideoOwnedByCreativeFactory('Create a promotional video', 'create_video') → true
isVideoOwnedByCreativeFactory('did the homepage video finish loading?') → false
```

`factoryIntentRouter.test.js` passes with static import path.

## Tests

| Command | Result |
|---------|--------|
| `npx vitest run src/lib/intake/__tests__/intakeShortcutContext.test.js src/lib/intake/__tests__/createVideoOntology.test.js src/lib/factoryRuntime/factoryIntentRouter.test.js` | **11/11 PASS** |
| `npx vitest run src/lib/storeResearch/__tests__/storeResearchPipeline.test.js` | **9/9 PASS** |
| `npx vitest run src/lib/intake/__tests__/intakeV2.test.js` | 2 pre-existing failures in `normalizePlan` (unrelated to Day 1) |

## Diff Scope Check

| File | Why in Day 1 |
|------|----------------|
| `apps/core/cardbey-core/render.yaml` | Staging-only Mission 001 / research flags |
| `apps/core/cardbey-core/src/lib/intake/intakeShortcutContext.js` | Ask→Create clarify dead-end fix |
| `apps/core/cardbey-core/src/lib/intent/storeCreateFastPath.js` | Honor `primaryModeHint` in shortcut resolution |
| `apps/core/cardbey-core/src/lib/intake/createVideoOntology.js` | Export video ownership helpers |
| `apps/core/cardbey-core/src/lib/factoryRuntime/factoryIntentRouter.js` | Static import + UAF guard for Factory video |
| `apps/core/cardbey-core/src/lib/intake/__tests__/intakeShortcutContext.test.js` | Ask→Create regression |
| `apps/core/cardbey-core/src/lib/intake/__tests__/createVideoOntology.test.js` | Video export regression |
| `docs/reports/GOLDEN_PATH_DAY1_GATE.md` | Gate report |

**Out-of-scope changes:** NONE

## Remaining Known Issues (Days 2–6 — not fixed)

1. Fragmented entry — multiple creation surfaces / CTA convergence (Day 2)
2. Mandatory name/location/category form before research (`computeMissingStoreCreationFields`)
3. Post-create redirect lands in Performer vs business preview
4. `/create` route convergence
5. Orchestra convergence
6. Result surface / publish flow redesign
7. Live staging deploy required to activate Mission 001 flag bundle on Render

## Day 2 Readiness

**NO** — merge + deploy Day 1 to staging first, then verify live create-store with Mission 001 flags active before entry convergence work.
