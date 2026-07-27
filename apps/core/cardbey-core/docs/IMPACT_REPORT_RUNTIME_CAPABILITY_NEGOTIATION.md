# Impact Report: Runtime Capability Negotiation Layer

## Observed issue

User-facing Performer stream showed `ENABLE_RUNTIME_STEP_EXECUTION is not defined` — a **ReferenceError** from frontend code using an undefined identifier, not an env misconfiguration message from the server.

## Audit

### 1. Frontend `VITE_ENABLE_*` reads (Performer execution path)

| File | Flags |
|------|-------|
| `usePerformerConsole.ts` | `VITE_ENABLE_PROACTIVE_CAMPAIGN_RUNWAY`; **broken** `ENABLE_RUNTIME_STEP_EXECUTION` (undefined) |
| `runtimeSessionClient.ts` | `VITE_ENABLE_RUNTIME_SESSION_*` (3 flags) |
| `ConsoleCentreColumn.tsx` | imports session flags |
| `ActiveMissionContext.tsx` | session rehydration flag |
| `useIntakeV2.ts` | `VITE_ENABLE_MISSION_HANDOFF` |
| `performerConsoleIntegration.ts` | proactive runway + dev leak message |

### 2. Backend `ENABLE_*` during request execution

| File | Exposure risk |
|------|----------------|
| `runtimeMissionStepRoutes.js` | Message mentions `ENABLE_RUNTIME_STEP_EXECUTION` |
| `runtimeSessionRoutes.js` | Message mentions `ENABLE_RUNTIME_SESSION_REHYDRATION` |
| `runtimeSessionService.js` | Resume disabled message mentions env var |

### 3. Feature → capability mapping

| Capability | Env |
|------------|-----|
| `runtimeKernel` | `ENABLE_PERFORMER_RUNTIME_KERNEL` |
| `runtimeStepExecution` | `ENABLE_RUNTIME_STEP_EXECUTION` |
| `runtimeSessionRehydration` | `ENABLE_RUNTIME_SESSION_REHYDRATION` |
| `runtimeMissionResume` | `ENABLE_RUNTIME_MISSION_RESUME` |
| `missionHandoff` | `ENABLE_MISSION_HANDOFF` |
| `sharedRuntimeToolRegistry` | `ENABLE_SHARED_RUNTIME_TOOL_REGISTRY` |
| `proactiveExecution` | `ENABLE_PROACTIVE_CAMPAIGN_RUNWAY` |

### 4. Config leak vectors

- Uncaught `ReferenceError` in proactive step runner → raw `.message` in chat
- Backend 503 JSON `message` fields citing env var names
- DEV-mode error passthrough in `trigger()` catch

### 5. Paths assuming capabilities without negotiation

- `resolveProactiveStepToolForExecution` gates on undefined constant
- Session hydration skips fetch based on client-only VITE flags (can desync from core)
- Step POST attempted even when core has capability off

## Smallest safe patch

Centralize capabilities behind `GET /api/runtime/capabilities`, `RuntimeCapabilitiesProvider`, sanitize user messages, friendly API errors. Flags remain; only reads are centralized.

## Rollback

Remove provider mount; restore direct VITE reads (not recommended). Backend endpoint is read-only.
