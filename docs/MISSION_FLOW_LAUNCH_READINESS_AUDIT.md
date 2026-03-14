# Mission Flow — MVP Launch Readiness Audit

**Audit date:** Pre-MVP launch  
**Scope:** End-to-end MVP path (home → Create store → mission detail → store input → Confirm & Run → processing → completion → continue next missions)

---

## 1. Launch status summary

**READY WITH MINOR FIXES**

- **Confirm & Run** is correctly wired: parent `storeInputState` plus `storeInputState ?? displayMission?.input` ensures the button enables when business name is filled; `startExecution` reads `mission.input` from store and validates with `isStoreInputReady(mission.input)`.
- **Full MVP path is implemented:** Home launcher → create mission → navigate to detail → plan generation → store input form → Confirm & Run → execution (quickStart/orchestrator) → drawer/progress → completion and “Continue next missions” launcher.
- **One low-risk regression:** Clearing `storeInputState` in a separate `useEffect` on `missionId` runs after the first effect; on first mount both run and can leave a brief moment where persisted input is not shown until next render. No functional blocker; optional one-line fix below.
- **Continue next missions** POST `/agent-messages` may 403 for client-only missions until execution has started (backend mission row); primary flow (Confirm & Run → completion) is unaffected. Pills/input are wired and work when backend allows.
- **No structural or layout refactor** in scope; spacing and copy changes only. Width at `max-w-3xl` is consistent between content and NextMissionLauncher.

---

## 2. Critical blocker check

**No true launch blockers identified.**

| Check | Result |
|-------|--------|
| Mission can start from home | OK — `createMissionFromLauncher` + `navigate(/app/missions/:id)`; pills prefill, Run creates mission. |
| Confirm & Run enables when input valid | OK — `isStoreInputReady(storeInput)` with `storeInput = storeInputState ?? displayMission?.input`; parent state updates on every form change. |
| Confirm & Run triggers execution | OK — `onConfirmRun` → `consoleCtx?.startExecution(missionId)`; `startExecution` uses `getMission(missionId).input` and `isStoreInputReady(mission.input)`. |
| Processing state appears | OK — Execution updates `mission.execution` in store; drawer opens; `ExecutionDrawer` shows progress. |
| Completion state appears | OK — `executionStatus === 'completed'` drives View report / Start new mission; completion summary from `getCompletionSummary(planType)`. |
| Next mission continuation | OK — NextMissionLauncher receives `missionId` and `missionContext`; pills and input call `apiPOST('/agent-messages', ...)`. No runtime errors on primary screens in the traced path. |

**Note:** If `/agent-messages` returns 403 for a mission that has not been “started” server-side, the user sees an error in the launcher; the main flow (Confirm & Run → processing → completion) does not depend on that endpoint.

---

## 3. High-risk regression check

| Area | Check | Result |
|------|--------|--------|
| **Stage 1** | Parent `storeInputState` + `updateMission` + `setStoreInputState` | Wired correctly; `storeInput={storeInputState ?? displayMission?.input}` and `onStoreInputChange` update both store and state. |
| **Stage 1** | Clearing `storeInputState` on `missionId` change | Second `useEffect` clears on every `missionId` change (including initial mount). On mount we then use `displayMission?.input`; no stale input when switching missions. |
| **Stage 1** | Confirm & Run disabled state | `confirmDisabled` derived from `isStoreInputReady(storeInput)`; `storeInput` is the merged value above. No lost wiring. |
| **Stage 2** | Spacing-only UI changes | No logic or props changed; safe. |
| **Stage 3** | Simplified summary copy / confidence behind toggle | Copy is one-line; technical details (including confidence) behind “View technical details”. No behavior change. |
| **Stage 4** | Continue next missions hint, pills, focus, placeholder | Additive/cosmetic; pills still call `handlePillClick(draftText)` → `sendMessage(draftText)`. |
| **Stage 5** | `max-w-3xl` alignment | MissionDetailView and NextMissionLauncher both use `max-w-3xl mx-auto`; alignment consistent. |

**Minor observation:** The `useEffect` that only runs `setStoreInputState(undefined)` on `missionId` runs on every missionId change, including the first mount. So on first paint we always have `storeInputState === undefined` and rely on `displayMission?.input`. For a mission that already has persisted input (e.g. refresh), the next render after getMission still shows it. No user-visible bug; optional improvement is to avoid clearing when we’re just mounting (see Minimal safe fixes).

---

## 4. Manual QA checklist

- [ ] **Home (`/app`)** — Mission Console title and “What would you like to run?” visible; textarea and Run button present; “Create store” pill prefills text; Run creates mission and navigates to `/app/missions/:id`.
- [ ] **Mission detail** — Mission summary card and “We're ready to prepare your store. Confirm & Run to start.” (or equivalent); Store input section with Form/Chat/OCR/Website pills; Business name *, Business type, Location fields.
- [ ] **Confirm & Run** — With only Business name filled (required), Confirm & Run enables; hint “Provide store input first.” disappears when valid; click runs execution and opens drawer.
- [ ] **Progress stream** — Drawer shows processing; animated progress lines during run; no console errors on primary path.
- [ ] **Completion summary** — On completion, “Your store draft is ready.” (or equivalent); View report and Start new mission buttons visible.
- [ ] **Technical details toggle** — “View technical details ▸” expands Confidence, Objective, Steps, Validation, Risk; “Hide technical details” collapses.
- [ ] **Continue next missions** — “Continue next missions” and “Click a suggestion or type below.” visible; pills (e.g. Review products, Improve hero) visible; pill click sends; typing and Send sends; error message appears if request fails.
- [ ] **Mission switching** — From mission A to mission B (e.g. via missions list or back then new mission): mission B detail shows; store input is B’s (or empty); no A input leaking.
- [ ] **Page refresh** — On mission detail page, refresh: mission still loads; persisted store input (if any) still shown; Confirm & Run state correct.

---

## 5. Minimal safe fixes only

**No mandatory fixes for launch.** One optional fix if you want to avoid any theoretical flash:

| File | Issue | Smallest fix | Why safe |
|------|--------|--------------|----------|
| `MissionDetailView.tsx` | (Optional) Clear `storeInputState` only when missionId actually changes from a previous value, not on initial mount. | Use a ref for previous `missionId` and call `setStoreInputState(undefined)` only when `prevMissionIdRef.current !== missionId` and then set ref to `missionId`. | Prevents clearing on first mount; keeps current behavior on real mission switch. No change to Confirm & Run or persistence. |

Do **not** add refactors, new features, or backend/orchestrator changes for this audit.

---

## 6. Final recommendation

**Ship after these 0–1 fixes**

- **0 fixes:** Current code is launch-ready for the MVP path. Confirm & Run, processing, completion, and continue-next-missions are wired and stable; no critical blockers.
- **1 fix (optional):** Apply the optional `storeInputState` clear-only-on-mission-change fix above if you want to avoid clearing on initial mount; otherwise ship as-is.

Base recommendation: **Ship now** from an MVP launch-readiness perspective. Optional fix is a small polish, not a gate.
