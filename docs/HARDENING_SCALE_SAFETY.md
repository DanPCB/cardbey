# Hardening: Scale Safety (W9)

**Goal:** Cap pilot blast radius, measure journey SLOs, automate canaries, define rollback triggers before broader exposure.

**Related:** [HARDENING_PROGRAM_V1.md](./HARDENING_PROGRAM_V1.md) Phase 3 (W9), [HARDENING_CANONICAL_PATHS.md](./HARDENING_CANONICAL_PATHS.md)

---

## Journey SLO definitions

### Primary SLO: `CREATE_STARTED` → `PREVIEW_READY`

Conceptual journey from user starting create-store to preview URL available. Maps to existing telemetry (no new product states required).

| Stage | SLO id | Detection signal | Owner |
|-------|--------|------------------|-------|
| **CREATE_STARTED** | `j1.create.started` | Intake returns `action: create_store` OR `store_mission_started`; log `[CREATE_STORE] CREATE_STORE_RUNTIME_DISPATCHED` | Core intake |
| **MISSION_BOUND** | `j1.create.mission_bound` | Response includes `missionId` + `generationRunId` | Core checkpoint dispatch |
| **BUILD_RUNNING** | `j1.create.build_running` | `GET /api/missions/:id/state` → step `structured_store_build` status `running` | Mission pipeline |
| **BUILD_COMPLETE** | `j1.create.build_complete` | Step `structured_store_build` status `completed` | Mission pipeline |
| **PREVIEW_READY** | `j1.create.preview_ready` | Draft `status: ready` AND preview route resolvable (`/preview/website/:draftId`) | Draft store service |

**Upload path (J2):** same SLO ids; `CREATE_STARTED` additionally requires `CREATE_STORE_FROM_UPLOAD` attachment preserved through ASK/handoff (see W5 continuity gates).

### SLO table (targets)

| SLO | Measurement window | Target | Warning | Critical (rollback) | Query / probe |
|-----|-------------------|--------|---------|---------------------|---------------|
| **J1 end-to-end success rate** | Rolling 24h | ≥ 95% | < 92% | < 85% | Ratio of `preview_ready` / `create_started` from structured logs or canary script exit code |
| **J1 P95 latency** (`CREATE_STARTED` → `PREVIEW_READY`) | Rolling 24h | ≤ 120s | > 150s | > 180s | Canary `pollMissionState` elapsed + draft ready poll (`golden-path-day4-staging-verify.mjs --full`) |
| **J1 P99 latency** | Rolling 24h | ≤ 180s | > 240s | > 300s | Same probe, p99 from log timestamps |
| **J2 upload handoff continuity** | Per deploy | 100% | Any ASK_HANDOFF empty after OCR success | 2 consecutive failures | Integration test `intakePendingTurnHandling`; manual upload canary |
| **Mission execution truth** | Per session | 100% | Any `tool.dispatch.failed` shown as success | Any in prod canary | Inspector / blackboard timeline audit (W2) |
| **Guest session continuity (J3)** | Rolling 24h | ≥ 99% | < 97% | < 95% | Mid-mission 401 rate on `/api/missions/:id/state` with valid guest cookie |
| **API success rate** | 24h | ≥ 95% | < 93% | < 90% | Existing `sloConfig.js` → `api_success_rate` |
| **API P95 latency** | 24h | ≤ 5000ms | > 6000ms | > 8000ms | Existing `sloConfig.js` → `api_latency_p95` |
| **Pilot cohort admission rate** | Rolling 7d | ≤ `CARDBEY_PILOT_COHORT_MAX` active TARGETs | 90% of cap | 100% of cap | `GET /api/admin/fundraising/.../targets` count |
| **Deploy integrity** | Per deploy | 100% | Health SHA mismatch | Canary fail | `/api/health?full=true` SHA vs git tag |

### Latency budget breakdown (J1 P95 = 120s)

| Segment | Budget | Signal |
|---------|--------|--------|
| Intake → `store_mission_started` | 15s | Intake response time |
| Mission bind + pipeline start | 10s | First state poll with steps |
| `structured_store_build` | 75s | Step completion |
| Draft materialize + ready | 20s | Draft API `status: ready` |

---

## Synthetic canary schedule

| Canary | Script / probe | Environment | Schedule | Pass criteria | On fail |
|--------|----------------|-------------|----------|---------------|---------|
| **Import graph smoke** | `apps/core/cardbey-core/scripts/smoke-create-store-runtime-graph.mjs` | CI every Core PR | Every push to Core | Exit 0 | Block merge (`gate:create-store-runtime`) |
| **Golden path quick** | `scripts/golden-path-day4-staging-verify.mjs` | Staging | Post-deploy + every 6h | MSD URL → `create_store` | Page ops; block prod promote |
| **Golden path full** | Same with `--full` | Staging | Post-deploy + daily 06:00 UTC | Through `preview_ready` within 180s | Rollback staging; hold prod |
| **Production J1/J2** | Golden path full against prod URLs (`DASHBOARD_STAGING_URL` / `CORE_STAGING_URL` env overrides) | Production | Post Core deploy (within 15 min) | Full pass | **Rollback Core** to last green SHA |
| **Kernel runtime** | `tests/runtime/kernelMandatory.test.js` | CI + canary-deploy | Pre-promote | Exit 0 | Abort promote |
| **Health + SHA** | `GET /api/health?full=true` | Prod | Post-deploy | `status: ok`, SHA matches artifact | Halt traffic shift |
| **Schema fingerprint** | Startup `assertSchemaFingerprintAtStartup` + health `requiredColumnsOk` | Prod | Continuous | `requiredColumnsOk: true` | Halt deploy / rollback |
| **Wave 0 rehearsal** (capital pilot) | `POST .../wave0-rehearsal` with `confirmInternalOnly:true` | Staging | Weekly (internal) | `ok: true`, `externalContact: false` | No prod impact; fix before investor pilot expand |

### Canary environment variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DASHBOARD_STAGING_URL` | Golden path dashboard base | `https://cardbey-dashboard-staging.onrender.com` |
| `CORE_STAGING_URL` | Golden path core base | `https://cardbey-core-staging.onrender.com` |
| `CANARY_METRICS_URL` | Post-deploy metrics probe | `/api/admin/platform/runtime-metrics` |
| `CANARY_MONITOR_SECONDS` | Wait before metrics check | `30` |

---

## Cohort limit env flags

Central reader: `apps/core/cardbey-core/src/config/pilotScaleLimits.js`

| Env flag | Default | Read in | Purpose |
|----------|---------|---------|---------|
| **`CARDBEY_PILOT_COHORT_MAX`** | `12` | `pilotScaleLimits.js` → `getWave0HumanReviewCohort`, fundraising wave0 route | Cap human-review cohort size for Wave 0 |
| `GUEST_MAX_DRAFTS` | prod `1`, dev `9999` | `miRoutes.js` orchestra/start | Guest create-store rate limit (24h window) |
| `CARDEY_BETA_PIL_CANARY_PERCENT` | `0` | `betaUserService.js` | PIL feature canary bucket 0–100 |
| `CARDEY_BETA_USER_IDS` | empty | `betaUserService.js` | PIL allowlist |
| `ENABLE_INVESTOR_*_V1` | non-prod true | `growthInvestorGovernanceConfig.js` | Gates Growth investor UI (not fundraising canonical) |

### Operational rules

1. **Production pilot:** set `CARDBEY_PILOT_COHORT_MAX=12` (or lower) until J1/J2 SLOs hold for 7 consecutive days.
2. **Fundraising TARGET admission:** reject batch admits that would exceed cap (future hook; until then enforce via ops checklist).
3. **Guest create-store:** keep `GUEST_MAX_DRAFTS=1` in prod unless J1 SLO ≥ 98% for 14d.
4. **Do not raise** `CARDBEY_BETA_PIL_CANARY_PERCENT` and pilot cohort cap in the same deploy.

---

## Rollback triggers

Immediate action required — no feature work until green.

| # | Trigger | Action | Owner |
|---|---------|--------|-------|
| 1 | **J1 or J2 production canary fails** post-deploy | Rollback Core to last green SHA; verify golden path on rolled-back version | Ops / release |
| 2 | **`gate:create-store-runtime` fails on main** | Block deploy; fix imports before any prod push | CI |
| 3 | **`requiredColumnsOk: false`** on prod health | Halt deploy; investigate migrations before traffic | DBA / Core |
| 4 | **J1 P95 > 180s** for 3 consecutive canary runs | Rollback Core; open perf incident | Ops |
| 5 | **J1 success rate < 85%** in 24h window | Rollback Core; preserve logs/traces | Ops |
| 6 | **`tool.dispatch.failed` displayed as success** (any prod report) | Hotfix W2 or rollback Dashboard + Core if intake regression | Dashboard |
| 7 | **Silent external contact** (`sends: true` without confirmation) on capital/fundraising path | Immediate flag-off (`ENABLE_INVESTOR_*`); incident review | Platform admin |
| 8 | **Pilot cohort cap exceeded** without override ticket | Pause TARGET admissions; audit duplicate admit paths | Fundraising ops |
| 9 | **Kernel smoke / kernelMandatory test fail** on promote | Abort promote (`canary-deploy.sh` rollback path) | Release |
| 10 | **API success rate SLO critical** (< 90% / 24h) | Rollback last deploy; scale investigation | Ops |

### Rollback playbook (abbreviated)

1. Identify last green SHA from deploy log / health history.
2. Roll back Core (and Dashboard if UI regression) on Render/host.
3. Run `node scripts/golden-path-day4-staging-verify.mjs --full` against rolled-back URL.
4. Confirm `/api/health?full=true` SHA matches.
5. Post incident note: which SLO breached, which duplicate path (if any) contributed.
6. Do not re-promote until failing SLO has owned fix + canary pass on staging.

---

## Observability hooks (minimal)

| Signal | Where | Use |
|--------|-------|-----|
| `[CREATE_STORE] *` | Core logs (`createStoreIntentContract.js`) | J1 segment timing |
| `store_mission_started` | Intake JSON responses | CREATE_STARTED count |
| `structured_store_build` step status | Mission state API | Build segment |
| Draft `status: ready` | `/api/stores/temp/draft` | PREVIEW_READY |
| `graphAdmission.eligible` | MI analyze response | Pre-admit gate metrics |
| `buildPilotReviewStats()` | Launchpad pilot-stats | Match review pilot health |

**Suggested log query (example):** filter `[CREATE_STORE] CREATE_STORE_RUNTIME_DISPATCHED` joined with mission id → step completed → draft ready; compute p95 delta in your log platform.

---

## Exit criteria (W9)

- [ ] SLO table targets agreed with ops
- [ ] Post-deploy golden path full automated on staging + prod
- [ ] `CARDBEY_PILOT_COHORT_MAX` set in prod env
- [ ] Rollback playbook exercised once on staging
- [ ] Dashboard or log query exists for J1 success rate (even if manual weekly)
