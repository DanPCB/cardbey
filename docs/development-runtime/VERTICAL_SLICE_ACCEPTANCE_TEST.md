# Vertical Slice Acceptance Test

## Goal fixture

Remove duplicate Console sidebar risk on `/app/development` and prove **exactly one** Console sidebar renders after a Cardbey-driven change reaches staging — without Cursor completing missing stages.

## Preconditions

- Core local (or staging) with auth enabled on `/api/development/*` (once B1 lands)
- `GITHUB_TOKEN` with repo scope
- Isolated worktree succeed (no repo-root fallback)
- Dashboard staging deploy observable

## Steps (must all be Cardbey-executed)

1. **Create mission** via API or `/app/development` UI with the fixture request text.
2. **Freeze evidence** including at least one of: screenshot path, Playwright trace, or failing DOM assert artifact (not empty arrays).
3. **Analyse + design** persisted with root-cause referencing `App.jsx` console classification.
4. **Human approves design** in Cardbey UI/API.
5. **Workspace prepare** returns path under `.development-workspaces/<missionId>` and `usedWorktree: true`.
6. **Implement** produces non-empty diff touching allowlisted dashboard files; creates/updates `DevelopmentCenterPage` as content-only.
7. **Checks** run with exit codes recorded; required suite green.
8. **Human approves patch** in Cardbey.
9. **Open PR** returns real GitHub PR number/URL; remote branch exists.
10. **CI monitoring** reads real checks; no rewriting workflows to force green.
11. **Staging deploy** recorded with deploy id + commit SHA matching PR head.
12. **Verify** staging URL `/app/development`: count of Console sidebar roots === 1; screenshot + timestamp + SHA stored on mission.
13. **Mission state** reaches `AWAITING_RELEASE_APPROVAL` or equivalent; **production not auto-merged**.

## Pass criteria

- All steps 1–13 have persisted evidence on the mission (not agent-written prose alone).
- No Cursor/manual `git`/`gh`/editor steps attributed to Cardbey.
- Empty patch or missing PR ⇒ **FAIL**.

## Audit baseline (2026-08-04) — FAIL

| Step | Result |
|------|--------|
| 1 Create | PASS (API) |
| 2 Evidence with real repro artifact | FAIL (empty screenshots/logs) |
| 3–4 Design approve | PASS (heuristic design) |
| 5 Workspace | FAIL on demo (`FAILED` / orphan worktree); calibration used repo root |
| 6 Non-empty patch | FAIL (calibration empty diff) |
| 7 Checks | PASS historically (exit 0) — insufficient alone |
| 8–13 | FAIL / NOT REACHED |

## Country Cafe note

Create-store blank-form verification is **out of scope** for this Development Runtime slice until a general coding agent exists. Track separately under product intake E2E, not as proof of Development Runtime autonomy.
