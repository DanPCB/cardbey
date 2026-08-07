# Cardbey Development Runtime — Current Implementation Audit

**Audit date:** 2026-08-04  
**Local API:** `http://localhost:3001/api/development/*` (live ping verified)  
**Store:** `apps/core/cardbey-core/.development-runtime/store.json`  
**Workspaces root:** `.development-workspaces/` (repo root)

## Verdict (preview)

**PARTIALLY_OPERATIONAL_EXTERNAL_AGENT_DEPENDENT**

Cardbey can track missions, freeze textual evidence, generate template designs, sometimes create a git worktree, apply a **hardcoded** duplicate-sidebar string patch, and spawn allowlisted local checks. It cannot generally diagnose/code, open real GitHub PRs, monitor CI, deploy staging, or browser-verify. There is no `/app/development` UI. General self-coding still depends on Cursor or another external coding agent.

## Architecture (live path only)

```
HTTP /api/development/*  (NO AUTH)
  → DevelopmentOrchestrator
      → DevelopmentStore (file JSON)
      → DevelopmentStateMachine (transition table)
      → prepareDevelopmentWorktree (git worktree | repo-root fallback)
      → generateMissionDesign (template heuristics, no LLM)
      → implementDevelopmentChange (hardcoded sidebar fixer OR empty patch)
      → runDevelopmentChecks (spawn pnpm allowlist)
      → openPullRequest (stub / fake URL; GitHubClient unused)
```

Unwired / broken relative to live path: `development/tools/*` post-PR methods, `WorkspaceManager`, `CommandPolicy`, `GitHubClient`/`GitHubApp` Octokit wiring, deploy/verify/rollback orchestrator methods.

## What was executed for this audit

1. Static read of `src/development/**`, `routes/development.routes.ts`, dashboard routes.
2. Live `GET /api/development/ping` and `GET /api/development/missions`.
3. Full parse of persisted mission `dev-1783820026186`.
4. Controlled MANUAL demo mission `dev-1785819587749` through design approve + workspace prepare (stopped; no external agent finished the slice).

## Primary audit question

> Can Cardbey receive a bug report and independently carry it through diagnosis → code → tests → review → PR → CI → staging deploy → functional verification without Cursor/another code agent?

**No.** Closest working chain ends at local checks / `AWAITING_CODE_REVIEW` for one hardcoded fixture class, with empty or non-durable code changes and no publication/deploy/verify.

## Key executable facts

| Fact | Evidence |
|------|----------|
| Missions survive process restart | File store `store.json`; mission still listed after prior calibration (~2026-07-12) |
| Storage is not a database | `developmentStore.ts` → `.development-runtime/store.json` only |
| Routes unauthenticated | `development.routes.ts` — no `requireAuth` |
| Design is not LLM-generated | `designPlanner.ts` templates; no openai/anthropic imports under `development/` |
| Implementation is not general | `implementationService.ts` — only `isDuplicateSidebarMission`; else empty `fileChanges` |
| Checks are real processes | `checkRunner.ts` spawn + exit codes; artifacts under `.development-workspaces/check-artifacts/` |
| GitHub PR is stubbed | `DevelopmentOrchestrator.openPullRequest` — manual `gh` command or fake `pull/new` URL; does not call `GitHubClient` |
| UI `/app/development` missing | No route in dashboard `App.jsx`; no `DevelopmentCenterPage` |
| Observed mission did not fix the page | Empty patch (0 lines); route still absent today |

## Related but out-of-scope systems

- Performer `code_fix` (store/website patch approval) — real `/api/performer/*`, not Development Runtime.
- `/api/self-healing/*` — governed proposal listing for admin discovery; not autonomous coding.
- Dead href `/admin/self-healing` in `adminAssistant.ts` — no page.

## Documents in this folder

| File | Purpose |
|------|---------|
| `CAPABILITY_EVIDENCE_MATRIX.md` | Per-capability status + evidence |
| `MISSION_TRACE_DEV_1783820026186.md` | End-to-end trace of calibration mission |
| `SECURITY_REVIEW.md` | Auth, secrets, command policy |
| `AUTONOMY_GAP_ANALYSIS.md` | Blocking / safety / ops / UX gaps |
| `VERTICAL_SLICE_ACCEPTANCE_TEST.md` | Pass criteria for first real slice |
| `IMPLEMENTATION_SEQUENCE.md` | Smallest reconnect sequence |
| `development-runtime-audit.json` | Machine-readable verdict |
