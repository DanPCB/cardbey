# Single Runway Execution UI Fix

## Summary

Mission Execution drawer now reflects the Single Runway architecture (IntentRequests + MissionEvents + Artifacts). Pipeline step cards are **status-only** when the mission has intents, events, or is completed—no more misleading “No outputs yet. Run the mission to generate outputs.” on completed missions.

## Files Changed

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/missionStepDisplay.ts` | Added `getStepStatusLine(status)` for status-only step cards: running → "Working…", completed → "Done", failed → "Something went wrong", ready → "Needs your input". |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ExecutionDrawer.tsx` | Introduced `singleRunwayTruthMode`; pipeline cards render title + icon + status line only when truth mode is on; PhaseOutputs (and thus "No outputs yet") are not rendered in that case. |

## Before / After

### Before

- On completed missions, step cards (Understanding / Building / Preparing) could still show **PhaseOutputs** with “Result: No outputs yet. Run the mission to generate outputs.”
- Misleading because outputs now come from Mission Inbox + MissionEvents + Artifacts, not from pipeline phase blocks.

### After

- **Truth mode** is on when any of: `inboxIntents.length > 0`, `missionEvents.length > 0`, or `mission.status === 'completed'`.
- When truth mode is on:
  - Pipeline step cards show **title + status icon + one-line status** only (Working… / Done / Needs your input / Something went wrong).
  - **No** “Result” section and **no** “No outputs yet…” anywhere in the step cards.
  - PhaseOutputs is not rendered in the Execution panel for those steps.
- Outputs are shown only in:
  - **Mission Inbox** (IntentRequests, Run button, intent result links)
  - **Agent Timeline** (MissionEvents)
  - **Artifacts** (draftReviewUrl, offer page, QR, feed; single primary “Open Draft Review” in Next-step card)
- **Advanced** still contains “Open pipeline runtime (debug)” and raw links; pipeline terminology remains only there.
- **Checkpoints** unchanged; workflow steps are not skipped.
- **Legacy missions** (no intents/events, not completed): PhaseOutputs still shown; once mission is completed, truth mode hides placeholders so we never show “Run the mission…” for completed missions.

## Constraints Preserved

- UI-only (no backend changes).
- Workflow steps and checkpoints preserved.
- Single Runway: only Mission Execution runs intents.
- Debug links under Advanced.
- One primary “Open Draft Review” CTA (Next-step card when completed); Artifacts shows it as a secondary link.

## Manual Verification Steps

### Completed mission

1. Open a **completed** store mission in the Execution drawer.
2. **Expect:** No “No outputs yet…” or “Run the mission to generate outputs” anywhere.
3. **Expect:** Pipeline cards (Understanding your business / Building your store / Preparing your preview) show **Done** (or appropriate status line) only—no Result block.
4. **Expect:** Mission Inbox and/or Artifacts show real outputs/links (e.g. Draft Review, offer page, QR).
5. **Expect:** Only **one** primary “Open Draft Review” button on the screen (in the Next step card).

### Running mission

1. Open a **running** store mission.
2. **Expect:** Pipeline cards show “Working…” where applicable.
3. **Expect:** Agent Timeline shows progress events.
4. **Expect:** Checkpoints still appear and block when needed.

### Legacy mission (no intents/events)

1. Open a mission that has **no** Mission Inbox intents and **no** MissionEvents (e.g. old mission).
2. **Expect:** UI still works; step cards may show PhaseOutputs until the mission completes.
3. **When mission is completed:** **Expect** no “Run the mission…” copy; step cards become status-only (Done).

### Advanced section

1. Expand **Advanced** in the Execution drawer.
2. **Expect:** “Open pipeline runtime (debug)” and/or Draft Review link present; pipeline terminology only here.
