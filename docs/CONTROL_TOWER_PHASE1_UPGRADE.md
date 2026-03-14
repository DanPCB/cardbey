# Control Tower Phase 1 — Mission Execution UI Upgrade

Upgrade the Mission Execution drawer to a "Control Tower" layout with clear section order, single CTA for Draft Review, and no rigid pipeline placeholders when the mission uses intents/events.

---

## Files changed

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ExecutionDrawer.tsx` | Added "What's happening now"; `controlTowerMode`; reordered sections (A→G); unified Artifacts; collapsible Advanced; hide PhaseOutputs/Output/Report when `controlTowerMode`; single Draft Review CTA (Next step card). |

No backend changes.

---

## Section order (top to bottom)

1. **What's happening now**
   - Running/validating: "Cardbey AI is working…" + Now: \<stage\> · Next: \<next stage\> (from store progress stages).
   - Completed: "Your draft is ready." + "Next step: Review before publishing."

2. **Checkpoints**
   - Existing checkpoint UI (validate, execute, publish) unchanged; single block at top.

3. **Mission Inbox**
   - Existing inbox (intents) with Run buttons and Create first offer when applicable.

4. **Agent Timeline**
   - Existing MissionEvents timeline with friendly labels.

5. **Artifacts**
   - Single list: Open Draft Review (link; primary CTA remains in "Next step" card only), View offer page, Open QR, Open feed from `intent.result` and report/artifacts. No duplicate primary Draft Review button here.

6. **Runnable now** (when running) + **StoreMissionProgress** + **Your next actions**
   - Unchanged.

7. **Growth opportunities**
   - Existing upgraded block (severity groups, evidence, forecast, Fix/Later/Dismiss).

8. **Steps timeline**
   - Step cards still rendered; when `controlTowerMode`, PhaseOutputs inside steps are **not** rendered (no "No outputs yet"–style pipeline blocks).

9. **AI Activity** (when running)
   - Unchanged.

10. **Next step CTA** (completed + `draftReviewUrl`)
    - Single primary "Open Draft Review" button.

11. **Output** (legacy)
    - Shown only when **not** `controlTowerMode`.

12. **Report** (legacy)
    - Shown only when **not** `controlTowerMode`.

13. **Advanced**
    - Collapsible `<details>`: pipeline runtime (debug), Draft Review link. Shown when there are debug links or `draftReviewUrl`.

14. **Failure** / **Cancel** / placeholder
    - Placeholder "Run a mission from the plan view…" hidden when `controlTowerMode`.

---

## controlTowerMode

`controlTowerMode` is true when the mission has intent/event content or completed report/artifacts:

- `inboxIntents.length > 0` OR  
- `missionEvents.length > 0` OR  
- `status === 'completed'` and (`report?.links?.length` or `report?.summary` or `mission?.artifacts?.storeId` or `mission?.artifacts?.draftId`)

When true:

- PhaseOutputs inside step cards are **not** rendered (no rigid pipeline "No outputs yet" blocks).
- Legacy **Output** and **Report** blocks are **not** rendered (Artifacts + Advanced cover links).
- Placeholder "Run a mission from the plan view…" is **not** shown.

---

## Single CTA for Draft Review

- **Primary CTA:** Only the **Next step** card ("Next step: Review your store before publishing" + "Open Draft Review" button) when `status === 'completed'` and `draftReviewUrl` exists.
- **Artifacts:** Draft Review appears as a normal link (not a second primary button).
- **Step cards:** No Draft Review links when `draftReviewUrl` exists (already the case).
- **Report:** No Draft Review in primary links; optional small link under Advanced.
- **Advanced:** Optional "Draft Review" link for power users.

---

## Before / after

**Before**
- Sections in a different order; no "What's happening now."
- Pipeline step cards could show PhaseOutputs ("No outputs yet" or similar) even when mission had intents/events.
- Output and Report blocks could duplicate Draft Review and other links.
- Debug links in Output/Report, not in a single Advanced section.

**After**
- Clear order: What's happening now → Checkpoints → Inbox → Timeline → Artifacts → … → Advanced.
- When the mission has intents/events or completed report/artifacts (`controlTowerMode`), pipeline PhaseOutputs are hidden and Output/Report blocks are hidden; Artifacts + Advanced provide links.
- One primary "Open Draft Review" (Next step card); other Draft Review entries are links only or under Advanced.
- Advanced is a single collapsible section for debug and optional Draft Review link.

---

## Manual test steps

1. **Completed mission (control tower)**
   - Open a completed store mission with at least one intent or event or report/artifacts.
   - Confirm **no** "No outputs yet" or empty pipeline result blocks in step cards.
   - Confirm **Artifacts** lists Draft Review (link), and any offer/QR/feed from intents.
   - Confirm **only one** primary "Open Draft Review" (the Next step card).
   - Confirm **Mission Inbox** and **Agent Timeline** are visible and correct.
   - Confirm **Growth opportunities** (if store has opportunities) still work (Fix/Later/Dismiss).
   - Confirm **Advanced** is collapsible and contains debug link and optional Draft Review link.

2. **Running mission**
   - Open a store mission that is validating or running.
   - Confirm **What's happening now** shows "Cardbey AI is working…" and Now/Next stage.
   - Confirm **Checkpoints** and **Mission Inbox** are visible.
   - Confirm timeline and inbox still update (e.g. after running a queued intent).

3. **Run intent**
   - With a queued intent, click **Run**.
   - Confirm timeline and artifacts update when the intent completes (e.g. offer/QR links from `intent.result`).

4. **Single CTA**
   - On a completed mission with `draftReviewUrl`, confirm only one primary "Open Draft Review" button (Next step card).
   - Confirm no second primary button in Artifacts or step cards.

5. **Advanced**
   - Open **Advanced**; confirm pipeline runtime (debug) and optional Draft Review link are present when applicable.
