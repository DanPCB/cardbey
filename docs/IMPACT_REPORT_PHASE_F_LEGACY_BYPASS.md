# Impact Report — Phase F Legacy Bypass Closure

**Date:** 2026-06-05  
**Status:** IN PROGRESS  
**Gate:** User-directed proceed (Phase E staging soak may still be pending in some environments)

---

## Purpose

Close legacy execution bypasses so tool dispatch and artifact mutation flow through Runtime Kernel authority. Each closure is **flag-gated (default OFF)** with telemetry-first measurement.

---

## Per-surface impact

### F1 — `POST /api/mi/orchestra/start` with `missionId`

| Field | Detail |
|-------|--------|
| **What could break** | Store build from mission-bound orchestra start; Improve dropdown flows that pass `missionId` |
| **Why** | `BROKER_BLOCK_ORCHESTRA_WITH_MISSION=true` returns 403 |
| **Impact scope** | `StoreDraftReview`, `ImproveDropdown`, E2E foundation tests |
| **Smallest safe patch** | Existing `guardBrokerOrchestraStart` + Phase F telemetry on every mission-bound start |
| **Flag** | `BROKER_BLOCK_ORCHESTRA_WITH_MISSION` (existing, default OFF) |

### F2 — MCP `dispatchTool` (external client)

| Field | Detail |
|-------|--------|
| **What could break** | External MCP integrations calling tools without runtime ownership |
| **Why** | `PHASE_F_BLOCK_MCP_DIRECT_DISPATCH=true` blocks; facade routes through `executeMissionAction` |
| **Impact scope** | `mcpServerRoutes.js`, external MCP clients |
| **Smallest safe patch** | Telemetry always; block/facade via separate flags |
| **Flags** | `PHASE_F_BYPASS_TELEMETRY` (default ON), `PHASE_F_BLOCK_MCP_DIRECT_DISPATCH`, `PHASE_F_ROUTE_MCP_VIA_FACADE` |

### F3 — `POST /api/performer/proactive-step` legacy fallback

| Field | Detail |
|-------|--------|
| **What could break** | Proactive plan "Run next" when `ENABLE_RUNTIME_STEP_EXECUTION=false` |
| **Why** | Legacy `executeProactiveRunwayStep` path removed when `PHASE_F_BLOCK_PROACTIVE_STEP_LEGACY=true` |
| **Impact scope** | Performer Console proactive campaigns |
| **Smallest safe patch** | Require kernel step execution OR return 503 with enablement hint |
| **Flag** | `PHASE_F_BLOCK_PROACTIVE_STEP_LEGACY` (default OFF) |

### F4 — Draft-store direct mutation without mission context

| Field | Detail |
|-------|--------|
| **What could break** | Publish, generate, commit from review UI without active mission |
| **Why** | Future block would require mission linkage for overlapping kernel paths |
| **Impact scope** | `draftStore.js` publish/generate/commit, `StoreDraftReview` |
| **Smallest safe patch** | **Telemetry only** in Phase F1 — record `bypassDraftStoreDirect` when high-risk routes lack `missionId` |
| **Flag** | `PHASE_F_BLOCK_DRAFT_STORE_RUNWAY` (default OFF, not wired to block yet) |

### F5 — Client `executeCapabilityPlan` step loop

| Field | Detail |
|-------|--------|
| **What could break** | Catalog replace, analyze store, offer draft from client-side executor |
| **Why** | `VITE_PHASE_F_VIEWER_ONLY_CAPABILITY_PLAN=true` returns blocked; user must use run-next/run-all |
| **Impact scope** | `executeCapabilityPlan.ts`, `ConsoleExecutionPanel`, next-step chips |
| **Smallest safe patch** | Early return with structured blocked response; no removal of module yet |
| **Flag** | `VITE_PHASE_F_VIEWER_ONLY_CAPABILITY_PLAN` (default OFF) |

---

## Rollout order (locked)

1. **Measure** — `PHASE_F_BYPASS_TELEMETRY=true`, all block flags OFF
2. **F1** — Enable `BROKER_BLOCK_ORCHESTRA_WITH_MISSION` in staging after baseline
3. **F2** — Enable `PHASE_F_ROUTE_MCP_VIA_FACADE`, then `PHASE_F_BLOCK_MCP_DIRECT_DISPATCH`
4. **F3** — Enable `PHASE_F_BLOCK_PROACTIVE_STEP_LEGACY` with `ENABLE_RUNTIME_STEP_EXECUTION=true`
5. **F4** — Review telemetry; enable `PHASE_F_BLOCK_DRAFT_STORE_RUNWAY` only after mission linkage UX ready
6. **F5** — Enable `VITE_PHASE_F_VIEWER_ONLY_CAPABILITY_PLAN` in staging dashboard

---

## Rollback

Unset Phase F flags in reverse order. Keep `PHASE_F_BYPASS_TELEMETRY=true` for visibility.

---

## Verification

```bash
# API snapshot
curl -s $API_BASE/api/broker/phase-f-bypass | jq

# Audit script (capabilities + telemetry baseline)
node scripts/phase-f-bypass-audit.mjs
```
