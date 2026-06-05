# Phase F Step 1 — Staging Checklist (orchestra/start + missionId)

**Closure:** `BROKER_BLOCK_ORCHESTRA_WITH_MISSION=true`  
**Telemetry:** `PHASE_F_BYPASS_TELEMETRY=true`  
**Enabled in:** `render.yaml` → `cardbey-core-staging` (staging branch deploy)

---

## Deploy

1. Merge/push to `staging` branch (Render auto-deploys `cardbey-core-staging`).
2. Wait for health check: `GET /api/performer/intake/v2` → 200.

## Verify flags (API)

```bash
curl -s https://cardbey-core-staging.onrender.com/api/broker/phase-f-bypass | jq
```

**Expect:**

```json
{
  "flags": {
    "brokerBlockOrchestraWithMission": true,
    "blockDraftStoreRunway": false,
    "blockMcpDirectDispatch": false,
    "blockProactiveStepLegacy": false,
    "routeMcpViaFacade": false
  },
  "telemetryEnabled": true
}
```

```bash
pnpm --filter @cardbey/core audit:phase-f-bypass
# API_BASE=https://cardbey-core-staging.onrender.com
```

---

## Acceptance (PASS criteria)

| Check | How to verify | Expected |
|-------|---------------|----------|
| Performer create-store | Intake V2 → create mini website | Works (no orchestra body `missionId`) |
| Analyze store | Proactive / intake direct tool | Works |
| Create offer draft | Runtime capability | Works |
| Discover → Performer | Rail handoff | Prefill only; no silent execute |
| Orchestra **with** `missionId` in body | `POST /api/mi/orchestra/start` `{ missionId, goal }` | **403** `BROKER_ORCHESTRA_BYPASS_BLOCKED` |
| Orchestra **without** `missionId` | Quick start / store build | Works |
| Metrics | `phase-f-bypass` snapshot after blocked attempt | `orchestraStartWithMission` / `orchestraStartBlocked` increment |
| Mission stuck states | Control tower / DB sample | No spike in `executing` orphans |

**Note:** Dashboard `startOrchestraFromMissionRuntime` usually does **not** send `missionId` in the HTTP body (client guard only). Draft review with `?missionId=` should keep working for orchestra goals that omit body `missionId`.

---

## Rollback

Render → `cardbey-core-staging` → Environment:

```env
BROKER_BLOCK_ORCHESTRA_WITH_MISSION=false
```

Redeploy. Keep `PHASE_F_BYPASS_TELEMETRY=true` for visibility.

---

## After Step 1 passes

Enable in order (staging only, one per soak):

1. ~~`BROKER_BLOCK_ORCHESTRA_WITH_MISSION=true`~~ (this step)
2. `PHASE_F_ROUTE_MCP_VIA_FACADE=true`
3. `PHASE_F_BLOCK_MCP_DIRECT_DISPATCH=true`
4. `VITE_PHASE_F_VIEWER_ONLY_CAPABILITY_PLAN=true` (dashboard staging)
5. `PHASE_F_BLOCK_PROACTIVE_STEP_LEGACY=true` (+ `ENABLE_RUNTIME_STEP_EXECUTION=true`)
6. `PHASE_F_BLOCK_DRAFT_STORE_RUNWAY=true` (last — high risk)
