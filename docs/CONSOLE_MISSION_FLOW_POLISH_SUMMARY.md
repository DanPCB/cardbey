# Console → Mission Flow Polish — Summary

**Date:** 2026-03-06  
**Scope:** Console home audit, Execution drawer Artifacts as primary result, single-runway UI language. No backend changes.

---

## Part 1 — Console home audit and cleanup

### Result

- **No old mission-start surfaces found on `/app`.** The only mission creation path is the launcher: `ConsoleHomeWorkspace` → `MissionLauncherView`; submit (Run) creates a mission and navigates to `/app/missions/:missionId`. The header "New mission" button focuses the composer (stays on `/app`), it does not create a mission.
- **No legacy mode language on home.** There is no "Pipeline" or "AI Operator" or "operator mode" on the console home; `MissionLauncherView` and `WorkspaceHeader` use neutral copy.
- **Quick options** are explicitly **suggestions (prefill only)** — label updated to: "Suggestions (prefill only) — click to fill the input, then Run".
- **Mission creation** still routes via `onMissionCreated` to `/app/missions/${mission.id}` (unchanged).

### Files changed (Part 1)

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/MissionLauncherView.tsx` | Pills section label: "Try quick options" → "Suggestions (prefill only) — click to fill the input, then Run"; `aria-label` set to "Suggestions (prefill only)". |

**Unchanged (verified):** `ConsoleHomeWorkspace.tsx`, `ConsoleShell.tsx`, `App.jsx` — no edits; launcher-only home and routing already correct.

---

## Part 2 — Mission Execution: Artifacts as primary result surface

### Result

- **Artifacts** are the primary result surface in the Execution drawer.
- **Order** in the drawer: status/step cards (Mission timeline) → Mission Inbox → Agent Timeline → **Artifacts** → Runnable now / Store progress / Your next actions → Growth opportunities → AI Activity (when running) → Report (summary) → Advanced (debug only) → Failure / Cancel / empty state.
- **Artifacts** are built from: (a) canonical `draftReviewUrl`, (b) `mission.artifacts` (e.g. Open Preview), (c) completed intent `result` (publicUrl, qrUrl, feedUrl), (d) `displayReport.links` (non-debug, excluding duplicate Draft Review).
- **One primary CTA:** When `draftReviewUrl` exists, a single **"Open Draft Review"** primary button is shown in the Artifacts section only. It is removed from "Your next actions" when shown in Artifacts; the standalone "Next step: Review your store" card and the duplicate "Output" block were removed.
- **Explanatory line** when artifacts exist: "These are the results created by your mission."
- **Advanced** shows only debug links (e.g. "Runtime (debug)"); Draft Review is no longer duplicated in Report or Advanced.

### Files changed (Part 2)

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ExecutionDrawer.tsx` | 1) Step cards (Mission timeline) moved to appear **after** Checkpoint and **before** Mission Inbox. 2) Artifacts block rewritten: one primary "Open Draft Review" button when `draftReviewUrl` exists; secondary links (Offer page, QR code, Intent feed, Open Preview, etc.) as "Label → Open". 3) Added line: "These are the results created by your mission." 4) `visibleActionItems` filters out actions whose primary CTA is "Open Draft Review" when `draftReviewUrl` is shown in Artifacts. 5) Removed duplicate "Next step: Review your store" card. 6) Removed redundant "Output" block (Artifacts is the single output surface). 7) Report block no longer shows Draft Review link. 8) Advanced section shows only debug links (no Draft Review link). |

---

## Part 3 — Single runway UI language cleanup

### Result

- **Pipeline / AI Operator** wording removed or neutralized in the Execution drawer.
- **Advanced** label: "Open pipeline runtime (debug)" → **"Runtime (debug)"** in `buildStoreOutputLinks`, `AdvancedDebugLink` default prop, and failure block.
- **Empty state:** "Run a mission from the plan view to see execution and report here." → **"Run a mission to see execution and results here."**

### Files changed (Part 3)

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ExecutionDrawer.tsx` | "Open pipeline runtime (debug)" → "Runtime (debug)" (3 places); empty-state copy updated as above. |

---

## Before / after (concise)

| Area | Before | After |
|------|--------|--------|
| **Console home** | Pills labeled "Try quick options". | "Suggestions (prefill only) — click to fill the input, then Run". |
| **Drawer order** | Mission Inbox, Agent Timeline, Artifacts, … then step cards later. | Step cards (status) → Mission Inbox → Agent Timeline → Artifacts → … → Growth opportunities → … |
| **Artifacts** | Mixed primary/secondary; Draft Review could appear in multiple blocks. | Single Artifacts section; one primary "Open Draft Review" when applicable; secondary links; explanatory line. |
| **Next-step CTA** | "Next step: Review your store" card + Output block + Report/Advanced could all show Draft Review. | Only Artifacts shows primary "Open Draft Review"; next actions and Advanced do not duplicate it. |
| **Advanced** | Could show "Open pipeline runtime (debug)" + Draft Review. | Only debug links (e.g. "Runtime (debug)"). |
| **Copy** | "Run a mission from the plan view…"; "Open pipeline runtime (debug)". | "Run a mission to see execution and results here."; "Runtime (debug)". |

---

## Manual verification checklist

Use this to confirm behavior after deployment or local run.

1. **Go to `/app`**
   - [ ] Launcher-centered home (Mission Console title, input, Run, pills).
   - [ ] No second mission-creation path (e.g. no extra "Create mission" that bypasses the launcher).
   - [ ] Pills label: "Suggestions (prefill only) — click to fill the input, then Run".

2. **Create mission from launcher**
   - [ ] Type in input (or use a pill to prefill), click Run.
   - [ ] Redirect to `/app/missions/:missionId`.

3. **Completed mission (store)**
   - [ ] Step cards show status only (no duplicate output CTAs in steps).
   - [ ] Artifacts section visible when outputs exist; includes "These are the results created by your mission."
   - [ ] Only one primary "Open Draft Review" CTA (in Artifacts).

4. **Mission with create_offer completed**
   - [ ] Artifacts show Offer page, QR code, Intent feed (or equivalent) as secondary links.

5. **Growth opportunities**
   - [ ] Still appears below Artifacts / next actions; behavior unchanged.

6. **Advanced**
   - [ ] Contains only debug links (e.g. "Runtime (debug)"); no Draft Review link.

---

## Files changed (all parts)

1. `apps/dashboard/cardbey-marketing-dashboard/src/app/console/MissionLauncherView.tsx` — launcher pills label and aria-label.
2. `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ExecutionDrawer.tsx` — drawer order, Artifacts as primary result, one-primary-CTA, Advanced debug-only, neutral copy.

No changes to: `ConsoleHomeWorkspace.tsx`, `ConsoleShell.tsx`, `App.jsx`, or any backend.
