# IMPACT REPORT — Promote live specialist agents to staging + live

Date: 2026-08-25  
Source: `fix/multi-agent-capability-e2e` (multi-agent Phases 1–7 + live agents A–F)  
Target: `staging` then `main` (live)

## What could break

1. **Coordinator / intake routing** — campaign NL may route into multi-agent orchestration more often.
2. **LLM cost/latency** — Research/Build/QA now call Claude (timeout bumped to 90s).
3. **Prisma migrate** — additive `BusinessLearning` table; deploy fails if migrate not applied.
4. **Dashboard artifact UI** — submodule bump must exist on remote or staging dashboard build breaks.
5. **Full-branch merge risk** — feature branch is ~50 commits ahead *and* behind staging; merging the whole branch would re-land divergent enrichment history and conflict with staging hotfixes.

## Why

Feature branch diverged from `origin/staging`. Staging already has SKP/SSR via separate hotfixes. Only the multi-agent commit range (`71e0aede2`..`1025c1b7d`, ~35 files) is the intended ship.

## Impact scope

- Core: orchestration agents, intake V2 fast-path, analytics/smart_visual executors, Prisma schemas/migrations, E2E harness
- Dashboard: MultiAgentMissionCard artifact renderers (submodule pointer)
- Live/staging Render auto-deploy on merge to `staging` / `main`

## Smallest safe patch

1. Commit leftover impact-report status line on feature branch (optional docs).
2. Create promote branch from `origin/staging` in a managed worktree (leave dirty canonical tree untouched).
3. Cherry-pick only multi-agent commits `71e0aede2`..`1025c1b7d`.
4. PR → merge to `staging` (Render staging deploy + migrate).
5. After staging merge is green, PR `staging` → `main` (Promotion Guard requires staging source).
6. Do **not** merge unrelated dirty WIP (draft store, claim test data, etc.).

## Operator confirmation

User requested: "commit and merge new update to staging and live."
