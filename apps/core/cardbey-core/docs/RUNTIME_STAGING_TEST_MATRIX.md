# Runtime Staging Test Matrix

**Generated:** 2026-05-27  
**Purpose:** Validate runtime authority consolidation before Single Runway enforcement.

## Environment baseline (staging)

```env
BROKER_EXECUTION_TELEMETRY=true
PERFORMER_RUNTIME_OWNERSHIP_WARN=true
PERFORMER_RUNTIME_UNIFIED_STREAM=true
PERFORMER_RUNTIME_DUPLICATION_DETECT=true
PERFORMER_EXECUTION_RECORDS_PERSIST=true
```

Advance one stage at a time per `RUNTIME_OWNERSHIP_GAP_MAP.md`.

**Runtime Kernel (Phases B–E):** See `docs/RUNTIME_KERNEL_STAGING_SOAK.md` and `.env.staging.runtime-kernel.example`. Check stage via `GET /api/runtime/capabilities` → `runtimeKernelRollout.rolloutStage`.

---

## Global checks (every test)

| # | Check | How |
|---|-------|-----|
| G1 | `broker.execution` present | TelemetryProbe or logs |
| G2 | No unexpected `broker.runtime.violation` | Or expected WARN only |
| G3 | `GET /api/broker/runtime-authority` | `rolloutStage` matches env |
| G4 | Artifacts visible in UI | Performer inspector |
| G5 | Rollback | Unset stage flag; retest G1 |

---

## Store flows

| ID | Flow | Steps | Stage | Pass criteria |
|----|------|-------|-------|---------------|
| S1 | Create store | Intake or mission `create_store` | A→B | Store row created; telemetry `tool:create_store` |
| S2 | Update store | Hero / catalog tool | B | No ownership block; artifact updated |
| S3 | Publish store | `POST` publish draft | — | Publish succeeds; **no broker regression** (non-dispatch path) |

---

## Campaign flows

| ID | Flow | Steps | Stage | Pass criteria |
|----|------|-------|-------|---------------|
| C1 | Create offer draft | Runtime API `/capabilities/create-offer-draft` | B | Draft artifact; execution record persisted |
| C2 | Revise offer draft | Runtime API revise | B | Revision artifact |
| C3 | Publish campaign | Proactive confirm / deploy | — | **LEGACY path**; document bypass metrics |

---

## Signage flows

| ID | Flow | Steps | Stage | Pass criteria |
|----|------|-------|-------|---------------|
| SG1 | Deploy signage | Mission tool or device route | B–C | Device/task completes |
| SG2 | Playlist update | Signage tool via pipeline | C | Pipeline telemetry + tool telemetry |
| SG3 | Device sync | `device.sendInput` or pairing | B | No silent failure; telemetry or clear error |

---

## QR flows

| ID | Flow | Steps | Stage | Pass criteria |
|----|------|-------|-------|---------------|
| Q1 | Create QR | QR creation route | — | No dispatchTool required |
| Q2 | Scan telemetry | Scan event ingestion | — | Independent of broker |
| Q3 | Landing activation | Landing page route | — | No broker regression |

---

## Performer flows

| ID | Flow | Steps | Stage | Pass criteria |
|----|------|-------|-------|---------------|
| P1 | Direct tool (default) | Intake V2 tool call | BASE | `broker.runtime.bypass` if legacy path |
| P2 | Direct tool (runtime) | `PERFORMER_RUNTIME_ENABLED=true` | B | `performer_runtime` source; nested telemetry skip |
| P3 | Mission action | Run mission to completion | C | Pipeline via facade |
| P4 | Approval gate | Tool requiring approval | B–D | Blocked until approve; stream shows approval category |
| P5 | Retry | Re-run analyze_store | B | Duplication probe if <15s; else success |
| P6 | Blocked mission | Invalid prerequisites | B | `blocked` status; no orphan executor crash |
| P7 | Dry-run only | Dashboard plan dry-run | — | No execution; advisory telemetry |

---

## API smoke

```bash
curl -s http://localhost:3001/api/broker/actions | jq '.count'
curl -s http://localhost:3001/api/broker/agent-capabilities | jq '.count'
curl -s http://localhost:3001/api/broker/runtime-authority | jq '.rolloutStage, .metrics'
```

---

## Stage gate criteria

| Stage | Gate before next |
|-------|------------------|
| A | Intake direct tools show facade source; no new failures in S1–S2 |
| B | P2 passes; `orphanWarnings` not increasing on owned paths |
| C | P3 passes; mission E2E green |
| D | P1 blocked or redirected; proactive/campaign manual sign-off |
| E | Zero critical workflows blocked in full matrix |

---

## Rollback procedure

1. Set failing flag to `false` or unset.
2. Restart API process (env reload).
3. Confirm `rolloutStage` in `/api/broker/runtime-authority`.
4. Re-run failed matrix rows only.
5. File incident note with probe tags and missionId samples.
