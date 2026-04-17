## Impact report: Performer console bugfixes (intent routing, 304 no-op, stale restore)

### (1) What could break
- **Intent routing could change**: Some prompts that previously routed to `launch_campaign` may now route to `create_store` (intended for the listed phrases). If patterns are too broad, unrelated prompts could misroute.
- **Mission polling behavior could change**: Adjusting 304 handling or cleanup/reset conditions could prevent intended resets (e.g., when mission is actually deleted), or could leave stale UI if we accidentally no-op on real errors.
- **Mission restore behavior could change**: On refresh, completed/ended missions will no longer reappear in the console header (intended). If the terminal-state detection is wrong, it could prematurely clear an active mission.

### (2) Why
- **Pattern overlap**: `launch_campaign` and `create_store` matching likely uses regex/substring heuristics; adding website-related aliases can overlap with existing campaign phrases unless ordered/anchored carefully.
- **304 response semantics**: 304 “Not Modified” is not an error and should not clear UI state. If the polling code treats “no body” as “missing mission,” it can reset state.
- **Persisted ID without validation**: Restoring a `missionId` without checking server status can surface finished missions as if they’re active.

### (3) Impact scope
- **Performer console**: intent routing entrypoint (`AgentPlanner.js`), mission header/console (`ActiveMissionContext.tsx`), API wrapper (`api.ts`) and any other helper used by mission polling.
- **Telemetry/debug output**: temporary additional `console.warn` traces for mission resets (requested for diagnosis).

### (4) Smallest safe patch
- **Intent routing**: Add *only* the explicitly listed aliases to `create_store`; ensure `launch_campaign` patterns do not match them (by tightening campaign patterns and/or prioritizing exact aliases before campaign matching).
- **304 no-op**: Ensure the **exact fetch path used by the poll loop** returns a no-op on 304 and does not trigger any “reset active mission” branches.
- **Reset guards**: If any timeout/cleanup resets exist, gate resets so they only happen on confirmed “mission gone” (404) rather than 304/network hiccup.
- **Stale restore**: On restore, fetch mission state; if terminal (completed/done/ended/failed), clear persisted `missionId` and keep console clean.

