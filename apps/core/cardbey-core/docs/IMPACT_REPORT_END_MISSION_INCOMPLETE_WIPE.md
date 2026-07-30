# Impact Report — End mission leaves prior create-store identity

**Date:** 2026-07-30  
**Surface:** Performer create-store / End mission → next upload  
**Live evidence:** End CA Handyman halfway → idle composer still “Create my store” → Coffee / Mộc Vietnamese logos still kick off **CA Handyman Services**; OCR 0% blockers; Prisma `mission.findUnique` connection closed (secondary).

## Root cause

Upload detach (`a641393`) cancels Core and clears URL/`ActiveMission`, but **End mission is a different path** and does not fully wipe intake binding:

1. **`intakeV2.activeMissionIdRef` only syncs when mid is truthy** — after `endActiveMission()` clears ActiveMission, the ref keeps the prior mid. The next `(Image attached)` POST reuses that mid (`resolveIntakeMissionBinding` fallthrough) because `storeCreationActive` is false so upload-detach does not fire.
2. **Panel “End mission” (`handleNewMission`) never calls `cancelMissionSession`** — Core can keep running the prior store pipeline.
3. **Header End on `/app?missionId=` does not React-Router-strip `missionId`** — only `history.replaceState` via `clearStaleMissionId`; RR can still rehydrate.
4. **Composer `onReset` is a noop** — “Create my store” (and pending image) survive End.

## What could break

- Ending a mission always cancels the in-flight Core pipeline (intentional; matches Header End).
- Clearing composer/pending image on End may drop typed text the user wanted to keep (acceptable for “End mission”).
- Skipping reuse of ended mids may force a new mission id on the next intake turn (desired).

## Impact scope

- `useIntakeV2.ts` — sync/clear mid; wipe intake session on `END_ACTIVE_MISSION_EVENT`
- `resolveIntakeMissionBinding.ts` — do not reuse ended / orphan mids on new upload
- `usePerformerConsole.ts` — `handleNewMission` cancels Core + clears URL/refs
- `ConsoleShell.tsx` — strip `?missionId=` via navigate on End
- `ConsoleCentreColumn.tsx` — `onReset` clears composer + pending image

## Smallest safe patch

Treat End mission like a full client session wipe for create-store: clear intake mid/handoff, cancel Core, strip URL, clear chat chrome (already via END event), clear composer.
