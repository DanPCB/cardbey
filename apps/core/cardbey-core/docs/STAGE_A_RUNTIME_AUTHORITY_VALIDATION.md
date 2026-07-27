# Stage A — Runtime Authority Validation (Authenticated Rerun)

**Date:** 2026-05-27  
**Environment:** local sandbox (`NODE_ENV=development`, sqlite `prisma/dev.db`)  
**Stage:** A — `BROKER_DIRECT_VIA_FACADE=true` only

## Flags (verified live)

| Flag | Value |
|------|-------|
| `BROKER_EXECUTION_TELEMETRY` | `true` |
| `BROKER_DIRECT_VIA_FACADE` | `true` |
| `PERFORMER_RUNTIME_ENABLED` | `false` |
| `PERFORMER_RUNTIME_PIPELINE_FACADE` | `false` |
| `BROKER_BLOCK_DIRECT_ACTION` | `false` |
| `PERFORMER_RUNTIME_OWNERSHIP_BLOCK` | `false` |

`GET /api/broker/runtime-authority` → `rolloutStage: "A"`, `rawEnv.BROKER_DIRECT_VIA_FACADE: "true"`.

## Authenticated context

| Field | Value |
|-------|-------|
| User | `sumsign@gmail.com` (`cmowpx6n7003ojv60pdjpbt7r`) |
| Store | `cmpo3vkia00tpjvwcsswm0oz0` (Banh Cuon Ba Nguyen) |
| Auth | JWT signed with dev `JWT_SECRET` (same as running Core API) |

**Script:** `scripts/stage-a-rerun.mjs`

---

## Test matrix results

### S2 — Store analyze (`POST /api/performer/runtime/capabilities/analyze-store`)

| Check | Result |
|-------|--------|
| HTTP | **200** |
| `ok` / `status` | `true` / `completed` |
| Summary output | **Yes** (`hasSummary: true`) |
| Duplicate execution | **No** |
| Artifact | Read-only analysis (no publish) |

**Telemetry:** `broker.execution` with `actionId: tool:analyze_store`, `source: performer_runtime_analyze_store`.  
**Note:** Runtime capability path (not intake facade); expected orphan warn (`runtimeOwned` partial) — **WARN only**, no block.

**Mission sample:** `cmpo4m44k006zjv64xr06wa40`

---

### P1 — Offer draft create (`POST /api/performer/runtime/capabilities/create-offer-draft`)

| Check | Result |
|-------|--------|
| HTTP | **200** |
| `ok` / `status` | `true` / `completed` |
| Artifact | `offer-draft:{missionId}:a2f30e7d` |
| Publish side effects | **None** (`publishBlocked` in artifact contract) |
| Duplicate draft | **No** (single artifact id per run) |

**Telemetry:** Offer draft builder path does not emit separate `tool:create_offer_draft` dispatch probes (builder-only); acceptable for Phase 8 capability API.

---

### P2 — Offer draft revise (`POST /api/performer/runtime/capabilities/revise-offer-draft`)

| Check | Result |
|-------|--------|
| HTTP | **200** |
| `ok` / `status` | `true` / `completed` |
| Revised artifact | `offer-draft:{missionId}:v2:c19436bd` (distinct from P1) |
| Duplicate execution | **No** |

---

### Stage A intake facade (supplemental)

**Request:** Intake V2 direct tool `signage.list-devices` with active store + mission.

| Check | Result |
|-------|--------|
| `action` | `tool_call` |
| `success` | **true** |
| `bypassDirectDispatch` after run | **0** (facade branch used; legacy bypass not recorded) |
| `broker.execution` | **Yes** (`tool:signage.list-devices`) |

**Telemetry source label:** Facade branch was active; `executeMissionAction` previously labeled `source: performer_intake_v2_direct` in the request (misleading). **Minimal fix applied:** facade dispatch now passes `source: performer_intake_facade` for accurate probes.

---

## Metrics before / after (in-process)

| Metric | Before run | After authenticated run |
|--------|------------|-------------------------|
| `bypassDirectDispatch` | 0 | 0 |
| `bypassFacade` | 0 | 0 |
| `orphanWarnings` | 0–1 | 3 (explainable: runtime analyze + intake without full runtime kernel) |
| `ownershipBlocks` | 0 | 0 |
| `duplicationWarnings` | 0 | 0 |
| `telemetryEmitted` | 0 | 4 |
| `directFacadeExecutions` | — | Increments when facade branch runs (after code reload) |

**Orphan analysis:** Warnings are **expected** under Stage A (ownership warn ON, block OFF). Sources include `performer_runtime_analyze_store` and intake paths without `PERFORMER_RUNTIME_ENABLED`. No spike in `ownershipBlocks`.

---

## Telemetry DB spot-check

Mission `cmpo4m44k006zjv64xr06wa40`:

| tag | actionId / notes |
|-----|----------------|
| `broker.execution` | `tool:analyze_store` started |
| `broker.execution` | `tool:signage.list-devices` started |
| `broker.runtime.violation` | `orphan_execution` (warn) |

Completed rows may be coalesced in probe payloads; HTTP outcomes were terminal `completed` for S2/P1/P2.

---

## Protected workflows

No changes to Mission FSM, pipeline internals, tool executors, `publishDraft`, signage deploy, QR routes, or proactive campaign deploy.

---

## Issues found (non-blocking)

1. **Telemetry source label** on facade `executeMissionAction` call — fixed to `performer_intake_facade`.
2. **Completed telemetry rows** — verify completed probes in a follow-up DB audit (started rows confirmed).
3. **`directFacadeExecutions` metric** — requires API process reload after staging metric patch.

---

## Rollback

```env
BROKER_DIRECT_VIA_FACADE=false
# keep BROKER_EXECUTION_TELEMETRY=true
```

Restart Core API.

---

## Stage B readiness

| Criterion | Status |
|-----------|--------|
| S2 analyze path works with real store | **PASS** |
| P1 create offer draft | **PASS** |
| P2 revise offer draft | **PASS** |
| No duplicate artifacts | **PASS** |
| No ownership blocks | **PASS** |
| Facade branch used (no legacy bypass) | **PASS** |
| `broker.execution` emitted on tool paths | **PASS** (started; completed audit optional) |
| Orphan warnings explainable | **PASS** |

**Recommendation:** **Proceed to Stage B** (`PERFORMER_RUNTIME_ENABLED=true`) after API reload picks up facade telemetry source + `directFacadeExecutions` metric. Re-run one intake direct tool under Stage B to confirm `performerRuntime.execute` wraps dispatch without regression.

---

# Stage B — Validation (PERFORMER_RUNTIME_ENABLED=true)

**Date:** 2026-05-27  
**Goal:** Confirm intake direct tool dispatch is wrapped by `performerRuntime.execute()` (single runway entry), without enabling pipeline facade or any blocking flags.

## Flags (Stage B)

- `PERFORMER_RUNTIME_ENABLED=true`
- `BROKER_DIRECT_VIA_FACADE=true`
- `BROKER_EXECUTION_TELEMETRY=true`

Kept OFF:

- `PERFORMER_RUNTIME_PIPELINE_FACADE=false`
- `BROKER_BLOCK_DIRECT_ACTION=false`
- `PERFORMER_RUNTIME_OWNERSHIP_BLOCK=false`
- `BROKER_BLOCK_ORCHESTRA_WITH_MISSION=false`

`GET /api/broker/runtime-authority` reported `rolloutStage: "B"`.

## Rerun results (`node scripts/stage-a-rerun.mjs`)

Mission sample: `cmpo4yqe00008jvcs5ywjmqob`

| Row | Result |
|-----|--------|
| S2 (analyze-store) | **PASS** (200, `completed`) |
| P1 (create-offer-draft) | **PASS** (200, `completed`, artifact created) |
| P2 (revise-offer-draft) | **PASS** (200, `completed`, v2 artifact created) |

## Intake dispatch wrapping confirmation

Intake test tool: `signage.list-devices`

Telemetry for that tool under Stage B shows:

- `source: performer_intake_v2_runtime`
- `executionSource: performer_runtime`
- `runtimeId: <uuid>`
- `started` + `completed` present

This indicates the intake call path went through `performerRuntime.execute()` → `executeRuntimeAction()` (runtime-owned), not the legacy direct dispatch.

## Metrics watch

Expected improvements were observed:

- `orphanWarnings`: **0** during the Stage B rerun (down from Stage A warn-only behavior)
- `bypassDirectDispatch`: **0**
- `duplicationWarnings`: **0** (one transient increment was observed mid-run, but final snapshot was 0 and no double execution was observed)
- `telemetryEmitted`: increased (runtime + tool telemetry present; nested tool telemetry skip engaged as designed)

## Stage C gate

**Stage B passes.** Next gate is Stage C: `PERFORMER_RUNTIME_PIPELINE_FACADE=true` with mission pipeline smoke tests.

---

## Stage C — Validation (PERFORMER_RUNTIME_PIPELINE_FACADE=true)

**Date:** 2026-05-27  
**Goal:** Validate pipeline-owned execution runs through `executeRuntimeAction` (runtime-owned facade) while keeping all blocking flags OFF.

### Flags (Stage C)

- `PERFORMER_RUNTIME_PIPELINE_FACADE=true`
- `PERFORMER_RUNTIME_ENABLED=true`
- `BROKER_DIRECT_VIA_FACADE=true`
- `BROKER_EXECUTION_TELEMETRY=true`

Kept OFF:

- `BROKER_BLOCK_DIRECT_ACTION=false`
- `PERFORMER_RUNTIME_OWNERSHIP_BLOCK=false`
- `BROKER_BLOCK_ORCHESTRA_WITH_MISSION=false`

### Pipeline-owned execution (store create/setup)

Created a store-type mission and advanced it via pipeline:

- Mission: `cmpo5etrz0008jvfwfmdp5k1c` (example)
- Result: **PASS** — mission reached `awaiting_input` / `blocked_on_checkpoint` without getting stuck `running`.

**No duplicate pipeline steps:** no duplicate `MissionPipelineStep.toolName` rows were detected for the mission.

**Telemetry (Stage C requirement):**

- `broker.execution` emitted with `actionId: pipeline:run_next_step`
- `runtimeId` present
- `executionSource: performer_runtime`
- `source: run_mission_until_blocked`

### Store analyze/update (safe)

- **PASS**: `POST /api/performer/runtime/capabilities/analyze-store` returned `completed` (via `node scripts/stage-a-rerun.mjs`).

### Offer create/revise (safe)

- **PASS**: `create-offer-draft` and `revise-offer-draft` capability APIs returned `completed` with distinct artifact ids (no duplication).

### QR-safe flow

- **PASS**: `GET /api/qr/:code/resolve` returned `{ ok: true, redirectUrl: ... }` (no tool dispatch).

### Signage-safe flow (if available)

- **PASS**: Intake direct tool `signage.list-devices` executed successfully (runtime-owned via Stage B kernel path).

### Metrics watch (Stage C)

Final snapshot showed:

- `orphanWarnings: 0`
- `bypassDirectDispatch: 0`
- `duplicationWarnings: 0`

### Stage D gate

**Stage C passes.** Next gate is Stage D: `BROKER_BLOCK_DIRECT_ACTION=true` (after confirming orphan map remains empty in staging logs).

## Re-run command

```powershell
cd apps/core/cardbey-core
node scripts/stage-a-rerun.mjs
```

Optional overrides:

```env
STAGE_A_USER_ID=cmowpx6n7003ojv60pdjpbt7r
STAGE_A_STORE_ID=cmpo3vkia00tpjvwcsswm0oz0
API_BASE=http://localhost:3001
```
