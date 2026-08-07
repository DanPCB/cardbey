# Development Runtime — Security Review

## Summary

**Production safety status for autonomous coding: UNSAFE to expose as a public self-coding surface.**  
Absence of production deploy executors currently prevents model-driven production changes, but the HTTP API is unauthenticated and can mutate local worktrees / run builds.

## Findings

### CRITICAL — Unauthenticated mutating API

- **Where:** `apps/core/cardbey-core/src/routes/development.routes.ts` mounted at `/api/development/*`
- **Risk:** Any client that can reach Core can create missions, approve designs/patches, prepare workspaces, run checks, request PRs
- **Evidence:** No `requireAuth` / role guard in route file; server comment notes no global auth middleware
- **Required:** AuthN + role (e.g. `platform_admin` / dedicated development operator) before any mutating verb

### HIGH — Workspace may bind to repo root

- **Where:** `prepareDevelopmentWorktree` when `DEVELOPMENT_USE_REPO_ROOT=1` or git unavailable; calibration mission path `C:\Projects\cardbey`
- **Risk:** Implementation writes into the developer’s primary tree
- **Required:** Fail closed unless isolated worktree succeeds; never silently fall back to repo root in non-test envs

### HIGH — Stub PR claims success path when token present

- **Where:** `DevelopmentOrchestrator.openPullRequest`
- **Risk:** With `GITHUB_TOKEN` set, code transitions to `PR_CREATED` with a **fake** `github.com/cardbey/cardbey/pull/new/...` URL without calling Octokit
- **Required:** Either call `GitHubClient` for real PR or refuse transition when integration incomplete

### MEDIUM — Windows `shell: true` in check runner

- **Where:** `checkRunner.ts` `spawn(..., { shell: useShell })` on win32
- **Mitigation today:** Args come from static manifest, not model output
- **Risk if future model-sourced commands:** shell injection
- **Required:** Keep allowlist; never pass model-built shell strings; prefer `shell: false`

### MEDIUM — Orphan worktrees / locked trees

- **Evidence:** Audit demo left `dev-1785819587749` locked after HTTP timeout
- **Risk:** Disk growth, branch clutter, inconsistent mission state (`FAILED` + worktree exists)
- **Required:** Recover-or-adopt existing worktree; cleanup on cancel/fail; raise gateway timeout for prepare

### LOW — Secrets

- Token read from `GITHUB_TOKEN` / `GH_TOKEN` env in orchestrator
- **NO EVIDENCE FOUND** of tokens written into `store.json` or design prompts
- Do not pass tokens into LLM contexts if/when LLM is added

### POSITIVE — Path security on writes

- `pathSecurity.ts` rejects `..`, enforces `allowedRoots` / `forbiddenPaths` (`.env`, secrets, etc.)
- Elevated paths flagged in manifest for review (auth, prisma, workflows)

### POSITIVE — No production deploy executor

- Tools referencing `deployToStaging` / production verify call **missing** orchestrator methods
- Production cannot currently be changed by this runtime (safe by absence)

## Approval gates (actual)

| Gate | Enforced? | AuthZ? |
|------|-----------|--------|
| Design approval | Yes (state) | No roles |
| Code/patch approval | Yes (state) | No roles |
| Staging deploy | N/A (missing) | |
| Production | N/A (missing) | |

## Recommendation before enabling broader access

1. Auth + admin role on all `/api/development/*` mutating routes  
2. Disable repo-root fallback outside tests  
3. Fix PR stub to fail closed  
4. Keep production deploy human-gated even after Render integration  
5. Never allow unrestricted shell from model output  
