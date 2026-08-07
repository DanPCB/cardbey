# Implementation Sequence — First Autonomous Vertical Slice

Reuse existing Phase-2 orchestrator, store, worktree helper, pathSecurity, checkRunner, and GitHubClient. Avoid broad redesign.

## Highest-leverage missing connection (do this first)

**A2 — Make `prepareWorkspace` reliable end-to-end.**

Evidence: audit demo created git worktree `dev-1785819587749` but HTTP timed out before the orchestrator persisted the workspace; retry set mission `FAILED` with `WORKSPACE_ALREADY_EXISTS` while store had no workspace.

Until this works, every later stage is unreachable on real isolated trees.

Concrete patch (smallest):

1. Raise/remove 10s gateway timeout for `/workspace/prepare` (or run prepare async + poll).
2. If worktree directory already exists for mission id, **adopt** it (load branch from `git worktree list`) instead of throwing.
3. Persist workspace record before returning; on failure after worktree create, record path + `FAILED` with cleanup hint.
4. Disable repo-root fallback outside tests (B2).

## Sequence after A2

| Step | Work | Reuses | Removes/labels | Size |
|------|------|--------|----------------|------|
| 1 | A2 workspace prepare reliability | `workspaceWorktree.ts`, orchestrator | Fail closed on repo root | M |
| 2 | B1 auth on development routes | existing Core auth middleware | — | S |
| 3 | Ensure sidebar implement produces durable non-empty diff + page files in worktree; add `/app/development` route under ConsoleShell | `implementationService.ts`, dashboard App.jsx | — | M |
| 4 | Wire `GitHubClient` into `openPullRequest` (push + real PR); fail closed if no token | `GitHubClient.ts` | Delete fake PR_CREATED success | M |
| 5 | Implement orchestrator `observeCI` using Octokit check runs | `GitHubClient.getCheckRuns` | Replace `observeCIResult` simulate | M |
| 6 | Staging deploy observer (Render API or poll service deploy by SHA) | — | Label tools that call missing methods | L |
| 7 | Playwright verify one sidebar on staging URL; attach evidence | — | — | L |
| 8 | Minimal `/app/development` operator UI: list, detail, approve, cancel | development API | — | M |

## Explicitly defer

- General-purpose self-coding for arbitrary bugs (A1 / XL) — required for true autonomy beyond the sidebar fixture, but **not** the first reconnect if the goal is one vertical slice on the known fixture.
- Production auto-deploy — remain human-gated.
- Full CI failure taxonomy — after CI read works.
- Rewriting `development/tools/*` wholesale — prefer orchestrator methods + thin HTTP routes already present.

## Definition of done for “first slice”

Mission created in Cardbey → isolated worktree → non-empty patch → local checks → human patch approve → **real GitHub PR** → CI read → staging SHA verified → browser assert one sidebar → stop before production.

## Do not

- Let Cursor finish PR/deploy and attribute to Cardbey.
- Count calibration empty-patch mission as success.
- Enable unauthenticated mutating routes on public Core.
