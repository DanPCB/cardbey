# Autonomy Gap Analysis

## A. Blocking Autonomous Execution

Without these, Cardbey cannot complete one end-to-end self-fix vertical slice.

| # | Severity | Missing behavior | Current | Required | Affected files | Deps | Acceptance | Size |
|---|----------|------------------|---------|----------|----------------|------|------------|------|
| A1 | P0 | General code modification | Hardcoded sidebar string edits only; other missions → empty patch | Tool-using model or governed patch engine that edits allowlisted paths from diagnosis | `implementationService.ts`, new agent loop | Model API + pathSecurity | Non-empty correct diff for novel bug without Cursor | XL |
| A2 | P0 | Reliable workspace prepare + persist | Worktree can exist while mission FAILED after HTTP timeout | Longer timeout; adopt existing worktree; transactional store write | `workspaceWorktree.ts`, `DevelopmentOrchestrator.prepareWorkspace`, API gateway timeout | git | Prepare returns READY with store workspace matching disk | M |
| A3 | P0 | Real GitHub branch push + PR | Stub / manual `gh` / fake URL; `GitHubClient` unwired | Orchestrator calls Octokit; push remote; real PR number/URL | `DevelopmentOrchestrator.openPullRequest`, `GitHubClient.ts` | `GITHUB_TOKEN`, repo perms | PR exists on GitHub for mission branch | M |
| A4 | P0 | CI observation | `observeCIResult` simulates + calls missing `updateState` | Poll GitHub checks; map to READY_FOR_STAGING / CI_FAILED | `observeCIResult.ts`, orchestrator | GitHub checks API | Mission reflects real CI | M |
| A5 | P0 | Staging deploy + SHA match | Missing `deployToStaging` | Trigger or observe Render deploy; record deploy id + SHA | new deploy service, orchestrator | Render API or git hook observer | Staging SHA == mission commit | L |
| A6 | P0 | Functional verification | Missing | Browser or API assert for acceptance criteria | new verify service | Playwright/API | Sidebar count / field assert persisted | L |
| A7 | P0 | Product surface for Development Runtime | `/app/development` absent | Route + page under ConsoleShell; single sidebar | dashboard `App.jsx`, new pages | A2–A3 optional for UI-only | One ConsoleSidebar on `/app/development` | M |

## B. Safety Blockers

Required before allowing real repository or staging access beyond local operators.

| # | Severity | Missing | Current | Required | Files | Size |
|---|----------|---------|---------|----------|-------|------|
| B1 | P0 | API authentication | None | Session/JWT + role | `development.routes.ts` | S |
| B2 | P0 | Fail closed on repo-root fallback | Fallback allowed | Throw unless `NODE_ENV=test` or explicit flag | `workspaceWorktree.ts` | S |
| B3 | P0 | PR stub fail-closed | Fake PR_CREATED | Error without Octokit success | `DevelopmentOrchestrator.ts` | S |
| B4 | P1 | Human production gate | N/A (missing deploy) | Keep explicit human approve; never model-auto prod | future deploy | S |
| B5 | P1 | Secret redaction in logs/events | Not audited end-to-end | Redact tokens in stdout artifacts | `checkRunner.ts`, event emit | S |

## C. Operational Gaps

| # | Severity | Missing | Current | Required | Size |
|---|----------|---------|---------|----------|------|
| C1 | P1 | Retry / recover prepare | FAILED sticky | Resume from orphan worktree | M |
| C2 | P1 | Worker / queue | Sync HTTP only | Background job for prepare/checks/CI poll | L |
| C3 | P2 | Immutable audit store | Mutable JSON file | Append-only events (DB or log) | L |
| C4 | P2 | Idempotent mission create | Date.now ids | Dedupe key | S |
| C5 | P2 | Check cwd honesty | May run tests against repo-root `node_modules` while editing worktree | Install or always mirror + run in worktree | M |

## D. UX Gaps

| # | Severity | Missing | Size |
|---|----------|---------|------|
| D1 | P1 | Mission list / detail / timeline UI | M |
| D2 | P1 | Approve design/patch buttons calling real API | S |
| D3 | P2 | Diff / check log / PR / deploy panels | M |
| D4 | P2 | Dead `/admin/self-healing` link | S |

## E. Later Enhancements

| Item | Notes | Size |
|------|-------|------|
| Multi-repo registry (dashboard separate) | Manifest only has `cardbey` | M |
| CI failure classification taxonomy | PATCH_CAUSED / PRE_EXISTING / … | L |
| Hotfix vs staging promotion policy engine | Currently baseBranch=main | L |
| Independent LLM code review | Separate from patch author context | L |
| Country Cafe / create-store verification pack | Product-specific | M |
| Rollback automation | States exist; no executor | L |

## External agent boundary (exact)

**Cardbey’s executable runtime ends at:**

1. Local file-backed mission orchestration through allowlisted checks, and  
2. Hardcoded duplicate-sidebar file transforms (when they produce a non-empty diff).

**External manual / Cursor coding begins when:**

- The bug is not the duplicate-sidebar keyword fixture, **or**
- A real PR must be opened/pushed, **or**
- CI must be interpreted, **or**
- Staging must be deployed/verified, **or**
- `/app/development` UI must be built/fixed beyond the string templates.

Calibration actors (`calibration-runner`, `calibration-owner`) are external to product UI — they exercised the API; they are not proof of in-product autonomy.
