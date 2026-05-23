# Stabilization rollback applied

**Date:** 2026-05-23 (re-applied)  
**Goal:** Return to last committed V1 flow; stop uncommitted perf/polling/projection WIP from affecting runtime.

### 2026-05-23 single-runway prep

- Dashboard: `git checkout -- .` on 12 tracked WIP files → **`317f686`** (unchanged from HEAD).
- Core: `git checkout HEAD --` on 10 tracked WIP files → **`f3be38f`** (includes **`38c2189`** preview preserve, **`f3be38f`** Anthropic default).
- Untracked experimental files left on disk (not imported by baseline).
- Phase 2: `shouldBlackboardFeedPoll` — hidden + `/app` consolidated Performer disables BlackboardFeed HTTP polling; AgentMessageFeed `pausePolling` on store/website `/app`.

## Actions taken

### Dashboard (`apps/dashboard/cardbey-marketing-dashboard`)

- `git checkout -- .` — restored **16 modified files** to committed **`317f686`** (`fix(blackboard): render structured payloads as user-facing progress`).
- **Untracked** stream/poll/consolidation files remain on disk but are **not imported** by `317f686` (build verified).
- `npm run build:dashboard` — **passed**.

### Core (`apps/core/cardbey-core` via monorepo root)

- `git checkout HEAD --` on all **29 modified tracked** paths — restored to **`f3be38f`**, which includes:
  - **`38c2189`** preview preserve (`draftStoreService.js`, `missionBlackboard.js`, `draftResolver.js`).
- **Untracked** perf/QA files (`reasoningLinePersist.js`, `draftCatalogQa.js`, `storeBuildTiming.js`, performer tools, etc.) remain on disk but are **not referenced** by committed code.

### Environment

- No `VITE_PERFORMER_BLACKBOARD_STREAM` / `VITE_PERFORMER_POLL_CONSOLIDATION` found in active `.env` files.
- No `REASONING_PERSIST_MODE` / `MISSION_BLACKBOARD_NON_BLOCKING` overrides in `apps/core/cardbey-core/.env`.

## Preserved (not reverted)

| Item | Commit / state |
|------|----------------|
| Preview wipe fix | `38c2189` (in `HEAD`) |
| Dashboard blackboard structured UI | `317f686` |
| Store generation pipeline | Committed core at `HEAD` |

## Removed from runtime (reverted WIP)

- Dashboard: `usePerformerConsole` / `missionProjectionSource` / `BlackboardFeed` poll-consolidation WIP (~2k lines).
- Core: SQLite reasoning debounce, non-blocking blackboard queue extensions, `prisma.js` WAL tuning, catalog QA in `finalizeDraft`, store build timing logs, pipeline post-summary WIP.

## What you should do now

1. **Restart core** and **dashboard dev servers** (pick up reverted files).
2. Run one store/mini-website mission — expect committed behavior without duplicate poll storm or P1008 from reasoning WIP.
3. To recover WIP later: see untracked files + `git stash` / branch from pre-rollback state if you had stashed (we did not stash; WIP was only in working tree — recovery from IDE local history or re-apply from docs if needed).

## Re-enable features later (one at a time)

1. Core catalog QA only: restore `draftCatalogQa.js` + targeted `draftStoreService` / `missionRecoveryState` changes.
2. Dashboard Phase 1 checkpoint: restore projection/console commits in a dedicated branch.
3. Poll consolidation last, with both flags and E2E network check.
