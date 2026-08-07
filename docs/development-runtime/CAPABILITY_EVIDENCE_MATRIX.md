# Capability Evidence Matrix

Statuses used (exactly one per row):  
`PRODUCTION_IMPLEMENTED` | `IMPLEMENTED_BUT_NOT_CONNECTED` | `PARTIALLY_IMPLEMENTED` | `TEST_ONLY` | `MOCK_ONLY` | `DOCUMENTATION_ONLY` | `EXTERNAL_AGENT_DEPENDENT` | `MISSING`

Environments: **local** confirmed via `localhost:3001`. Staging/prod mount the same `/api/development/ping` (HTTP 200) but this audit did not re-run mutation flows there.

---

## 1. Mission intake and persistence

| Item | Status | Evidence |
|------|--------|----------|
| Create route | PRODUCTION_IMPLEMENTED | `POST /api/development/mission` → `DevelopmentOrchestrator.createMission` |
| Validation | PARTIALLY_IMPLEMENTED | Requires `title`, `request`, `expectedOutcome`, `requestedBy`; weak type checks |
| Mission types | PARTIALLY_IMPLEMENTED | Type field accepted (`BUG_FIX` observed); no rich type-specific executors beyond sidebar heuristic |
| Durable storage | PRODUCTION_IMPLEMENTED | File JSON, not DB — survives restart |
| Restart recovery | PRODUCTION_IMPLEMENTED | Store load on construct |
| Idempotency | MISSING | New id `dev-${Date.now()}` every create |
| Status transitions | PARTIALLY_IMPLEMENTED | Enforced via `DevelopmentStateMachine.validateTransition` on orchestrator path |
| Event history | PRODUCTION_IMPLEMENTED | `events[]` in store (capped 5000) |
| Cancellation | PRODUCTION_IMPLEMENTED | `POST .../cancel` → `CANCELLED` |
| Retry | MISSING | No retry worker; workspace retry after timeout → `FAILED` / `WORKSPACE_ALREADY_EXISTS` |
| AuthZ / ownership | MISSING | No auth on routes |

**Answers:**  
- `/api/development/missions` is **file-backed durable storage**, not in-memory-only fixtures.  
- Observed mission **survives restart**.  
- State is **mostly derived from orchestrator transitions**, but `dev-1783820026186` shows **inconsistent manual/calibration mutation** (CODE review APPROVED while state remains `AWAITING_CODE_REVIEW`).

---

## 2. State machine

| Item | Status | Evidence |
|------|--------|----------|
| Canonical machine | PRODUCTION_IMPLEMENTED | `DevelopmentStateMachine.ts` |
| Enforcement | PARTIALLY_IMPLEMENTED | Validated on orchestrator transitions; tools calling missing methods bypass |
| Handlers through code review | PARTIALLY_IMPLEMENTED | freeze → analyse → design → workspace → implement → checks → approvePatch → openPR stub |
| CI / staging / prod states | MISSING | Transitions listed; **no orchestrator executors** |
| User-listed aliases (`RECEIVED`, `SCOPING`, …) | MISSING | Actual enums differ (`REQUESTED`, `ANALYSING`, …) |

States with **no executable handler:** `EVIDENCE_REQUIRED` (skippable), `CI_RUNNING`, `CI_FAILED`, `READY_FOR_STAGING`, `STAGING_*`, `AWAITING_RELEASE_APPROVAL`, `PRODUCTION_*`, `COMPLETED`, `ROLLED_BACK` (except cancel paths).

---

## 3. Repository registry

| Item | Status | Evidence |
|------|--------|----------|
| Active manifest | PRODUCTION_IMPLEMENTED | `cardbeyRepositoryManifest.ts` — single `repositoryId: 'cardbey'` |
| DanPCB/cardbey-marketing-dashboard as separate repo | MISSING | Treated as monorepo path / submodule under `cardbey` |
| Default branch | PRODUCTION_IMPLEMENTED | `main` |
| Staging/prod branch policy | MISSING | No promotion policy engine |
| Install/lint/test/build commands | PARTIALLY_IMPLEMENTED | `allowedChecks` only (pnpm vite/vitest subset) |
| Deploy service / health / verify scenario | MISSING | Not in active manifest |
| Legacy `CARDBEY_MANIFEST` | MOCK_ONLY | Unused by Phase-2 orchestrator |

---

## 4. Workspace isolation

| Item | Status | Evidence |
|------|--------|----------|
| Real git worktree | PARTIALLY_IMPLEMENTED | `prepareDevelopmentWorktree` — `git worktree add`; demo created `dev-1785819587749` |
| Workspace id ≠ proof | — | `ws-dev-1783820026186` pointed at **repo root** `C:\Projects\cardbey` |
| Cleanup | PARTIALLY_IMPLEMENTED | `DELETE .../workspace` → `removeDevelopmentWorktree` |
| Resource limits / network policy | MISSING | |
| Crash recovery | MISSING | Timeout left worktree on disk, store without workspace → retry FAILED |
| `CommandPolicy` / `WorkspaceManager` | IMPLEMENTED_BUT_NOT_CONNECTED | Not used by orchestrator |

---

## 5. Repository inspection

| Item | Status | Evidence |
|------|--------|----------|
| Filename/code search | PARTIALLY_IMPLEMENTED | `repositoryTools.searchRepository` used inside sidebar fixer |
| Read/write files | PRODUCTION_IMPLEMENTED | `pathSecurity.readWorkspaceFile` / `writeWorkspaceFile` |
| Git history / ownership | MISSING | |
| General LLM tools | EXTERNAL_AGENT_DEPENDENT | No model tool loop in Development Runtime |

---

## 6. Reproduction

| Item | Status | Evidence |
|------|--------|----------|
| Evidence freeze API | PRODUCTION_IMPLEMENTED | `POST .../evidence` |
| Screenshots / browser / network | MISSING | Arrays empty on calibration mission |
| Deterministic repro tests before patch | MISSING | Textual steps only |
| `evidenceSnapshotId` | PRODUCTION_IMPLEMENTED | Points at real `evidence` record — **content is mostly authored text**, not captured runtime proof |

---

## 7. Diagnosis / root cause

| Item | Status | Evidence |
|------|--------|----------|
| Impact report | MOCK_ONLY / heuristic | Hardcoded findings for sidebar keyword missions |
| Confirmed root cause | PARTIALLY_IMPLEMENTED | Sidebar fixer sets string diagnosis; not general |
| External insertion | EXTERNAL_AGENT_DEPENDENT | Calibration actors (`calibration-runner`) drove the recorded flow |

---

## 8. Patch creation

| Item | Status | Evidence |
|------|--------|----------|
| Apply edits | PARTIALLY_IMPLEMENTED | Hardcoded App.jsx + test transforms for duplicate-sidebar only |
| Diff artifact | PARTIALLY_IMPLEMENTED | Written under `.development-workspaces/diffs/`; calibration mission **0 bytes** |
| Path allowlist | PRODUCTION_IMPLEMENTED | `pathSecurity` + manifest `allowedRoots` / `forbiddenPaths` |
| Code generation engine | EXTERNAL_AGENT_DEPENDENT | No Cursor/Codex/Claude API in runtime; deterministic string edits only for one fixture |

---

## 9. Command execution

| Item | Status | Evidence |
|------|--------|----------|
| Runner | PRODUCTION_IMPLEMENTED | `checkRunner.runCommand` via `spawn` |
| Allowlist | PRODUCTION_IMPLEMENTED | Manifest `allowedChecks` only on live path |
| Shell on Windows | PARTIALLY_IMPLEMENTED | `shell: true` on win32 — injection risk if args ever model-sourced |
| Unrestricted model commands | MISSING (good) on live path | Orchestrator does not exec arbitrary strings |
| `CommandPolicy` | IMPLEMENTED_BUT_NOT_CONNECTED | |

**Allowed check commands (live):** `pnpm exec vite build --minify=false`; `pnpm exec vitest run src/components/development/`; `pnpm exec vitest run ...developmentConsoleRouting.test.tsx`; `pnpm exec vitest run src/development/__tests__/developmentPhase2.test.ts`. Plus `git` in worktree helper.

---

## 10. Test execution

| Item | Status | Evidence |
|------|--------|----------|
| Targeted vitest/build | PRODUCTION_IMPLEMENTED | Real exit codes persisted |
| Integration / browser E2E | MISSING | |
| Pass/fail from exit codes | PRODUCTION_IMPLEMENTED | `exitCode === 0` → PASSED |
| Calibration checks | PRODUCTION_IMPLEMENTED (historical) | Four PASSED with exit 0 for `dev-1783820026186` |

---

## 11. Independent review

| Item | Status | Evidence |
|------|--------|----------|
| Independent reviewer model | MISSING | Human string `reviewerUserId` only |
| API to approve patch | PRODUCTION_IMPLEMENTED | `POST .../patch/approve` → `READY_FOR_PR` |
| UI to approve | MISSING | No `/app/development` |
| Auto-resume after approval | PARTIALLY_IMPLEMENTED | Does **not** auto-open PR; caller must `POST .../pull-request` |
| Calibration inconsistency | — | CODE review APPROVED recorded while state stayed `AWAITING_CODE_REVIEW` |

---

## 12. GitHub publication

| Item | Status | Evidence |
|------|--------|----------|
| Octokit client exists | IMPLEMENTED_BUT_NOT_CONNECTED | `GitHubClient.ts` |
| Orchestrator PR | MOCK_ONLY | Stub URL / manual `gh pr create` |
| Branch create/commit/push via runtime | PARTIALLY_IMPLEMENTED | Local worktree branch + `gitCommitAll` on approvePatch; **no push** in openPR stub |
| Credentials in prompts | NO EVIDENCE FOUND of prompt leakage | Token read from env only in openPR |

---

## 13. Branch / promotion policy

| Item | Status | Evidence |
|------|--------|----------|
| feature→staging→main policy engine | MISSING | `baseBranch` defaults to `main` |
| Hotfix policy | MISSING | |
| Divergence detection | MISSING | |

---

## 14. CI monitoring / classification

| Item | Status | Evidence |
|------|--------|----------|
| Read GitHub checks | IMPLEMENTED_BUT_NOT_CONNECTED | `GitHubClient.getCheckRuns` unused |
| `observeCIResult` | MOCK_ONLY | Comments say “Simulate”; calls missing `orchestrator.updateState` |
| Classifications PATCH_CAUSED / PRE_EXISTING / … | MISSING | |

---

## 15. Deployment

| Item | Status | Evidence |
|------|--------|----------|
| Render API / deploy trigger | MISSING | Tools call nonexistent `deployToStaging` |
| Git-triggered deploy observation | MISSING | |
| Staging/prod ordering | MISSING | |

---

## 16. Functional verification

| Item | Status | Evidence |
|------|--------|----------|
| Browser automation / sidebar count | MISSING | |
| Staging URL verify | MISSING | `verifyStaging` missing on orchestrator |
| Country Cafe create-store verify | MISSING | Not part of Development Runtime |

---

## 17. Approval and production safety

| Item | Status | Evidence |
|------|--------|----------|
| Design approval gate | PRODUCTION_IMPLEMENTED | Required before workspace |
| Patch approval gate | PRODUCTION_IMPLEMENTED | Required before READY_FOR_PR |
| Production gate | MISSING | No production executor (safe by absence) |
| Role checks | MISSING | Any caller can approve |

---

## 18. Auditability

| Item | Status | Evidence |
|------|--------|----------|
| Event log | PARTIALLY_IMPLEMENTED | Typed events with actor/time; not immutable/append-only DB |
| Evidence/design ids resolve | PRODUCTION_IMPLEMENTED | Readable JSON records |
| Commit SHA / PR / deploy on events | PARTIALLY_IMPLEMENTED | Branch/patch ids sometimes; no deploy IDs |

---

## 19. Failure recovery

| Item | Status | Evidence |
|------|--------|----------|
| Backend restart mid-mission | PARTIALLY_IMPLEMENTED | State reloads from file; in-flight worktree may desync |
| Workspace prepare timeout | PARTIALLY_IMPLEMENTED | Demo: HTTP 10s timeout → orphan worktree → FAILED |
| Cancel | PRODUCTION_IMPLEMENTED | |
| Duplicate callbacks | MISSING | |

---

## 20. UI / operator control

| Item | Status | Evidence |
|------|--------|----------|
| `/app/development` | MISSING | |
| Mission list/detail UI | MISSING | API only |
| Duplicate sidebar fixed | MISSING | Route + page absent; empty patch |

---

## Demo mission `dev-1785819587749` (2026-08-04)

| Stage | Result |
|-------|--------|
| Create | OK — MANUAL |
| Evidence | OK — textual |
| Analyse | OK — heuristic |
| Design propose | OK — template (MANUAL does not auto-propose; explicit POST required) |
| Design approve | OK → `WORKSPACE_PREPARING` |
| Workspace prepare | **FAILED** — worktree dir created + locked; HTTP timeout; retry `WORKSPACE_ALREADY_EXISTS`; mission `FAILED` |
| Implement / tests / PR / CI / deploy / verify | **NOT REACHED** (stopped; no external agent completion) |
