# Impact Report: Phase 2 — Mission-Centric Routing + Mission Logs (UI-only)

**Scope:** New routes /app/missions, /app/missions/:missionId; mission store (localStorage); Mission Logs list and Mission Detail views; no backend/API.

## Risk assessment

**(a) What could break**
- **Route matching:** If we add nested routes under `/app`, React Router must still match `/app/back` first (it is more specific and is declared first). No change to `/app/back` or `/dashboard`.
- **isConsole:** Currently `pathname === '/app'`. If we only add sibling routes `/app/missions` and `/app/missions/:missionId`, those paths would not get the “no PageShell” layout unless we extend isConsole. Extending to `pathname === '/app' || pathname.startsWith('/app/missions')` is scoped and does not include `/app/back`, `/app/store`, etc.
- **Store creation / preview / auth:** No changes to store review, preview, auth middleware, or RequireAuth. Mission store is client-only (localStorage). No risk to French Baguette E2E.

**(b) Why**
- React Router v6: more specific path `/app/back` is declared before the parent `/app`, so `/app/back` and its children still match correctly. New nested routes under `/app` (index, missions, missions/:missionId) only match under the console layout.
- isConsole is used only to skip PageShell for console routes; narrowing to `/app` and `/app/missions*` keeps other /app/* routes (back, store, performer, etc.) unchanged.

**(c) Mitigation**
- Keep `/app/back` and all existing /app/* route declarations exactly as they are. Add only a parent `<Route path="/app">` with nested index + `missions` + `missions/:missionId`, and render `<Outlet />` inside ConsoleShell. Set `isConsole = pathname === '/app' || pathname.startsWith('/app/missions')`.

**(d) Rollback**
- Revert Phase 2 commit(s). Restore single `/app` route without nested routes; restore ConsoleShell to render ConsoleHomeWorkspace directly (no Outlet); remove mission store, MissionLogsListView, MissionDetailView, and related wiring. No backend or auth changes to revert.

---

## Routing approach (safest)

- **Current:** One route: `<Route path="/app" element={<RequireAuth><ConsoleShell /></RequireAuth>} />`. ConsoleShell always renders ConsoleHomeWorkspace.
- **Proposed:** Turn `/app` into a **layout route** with nested routes:
  - `<Route path="/app" element={<RequireAuth><ConsoleShell /></RequireAuth>}>`
  - `<Route index element={<ConsoleHomeWorkspace ... />} />`  → /app
  - `<Route path="missions" element={<MissionLogsListView />} />`  → /app/missions
  - `<Route path="missions/:missionId" element={<MissionDetailView />} />`  → /app/missions/:id
- ConsoleShell renders Sidebar, WorkspaceHeader (with mission context when missionId in URL), and `<Outlet />` for the child. No change to /app/back or other /app/* routes (they remain separate Route entries and match first where more specific).

---

## Phase 2 Deliverables (Completed)

### Files added

| File | Purpose |
|------|--------|
| `src/app/console/missions/missionStore.ts` | Mission type; listMissions, getMission, createMission, updateMission; localStorage with safe JSON; seed 3 missions on first run. |
| `src/app/console/missions/MissionLogsListView.tsx` | List with status pill, time, title; links to /app/missions/:id. |
| `src/app/console/missions/MissionDetailView.tsx` | User prompt + PlanProposalBlock; Confirm & Run opens drawer stub; Modify navigates to /app; Cancel updates mission to cancelled and navigates to list. |
| `src/app/console/missions/PlanProposalBlock.tsx` | UI block: Objective, Steps, Risk, Confidence; Confirm & Run / Modify / Cancel. |
| `src/app/console/ConsoleContext.tsx` | ConsoleProvider; drawerOpen, drawerStep, openDrawerWithStub (validation → execution → report stub sequence). |

### Files modified

| File | Change |
|------|--------|
| `App.jsx` | isConsole = pathname === '/app' \|\| pathname.startsWith('/app/missions'). /app is parent route with nested index (ConsoleHomeWorkspace), path="missions" (MissionLogsListView), path="missions/:missionId" (MissionDetailView). |
| `src/app/console/ConsoleShell.tsx` | ConsoleProvider; ConsoleShellInner with useParams(missionId), getMission for header; Outlet with context composerApiRef; ExecutionDrawer(open, step). |
| `src/app/console/WorkspaceHeader.tsx` | missionTitle, missionStatus props; status pill shows mission status or "Idle". |
| `src/app/console/ExecutionDrawer.tsx` | step prop: validation / execution / report stub content. |
| `src/app/console/ConsoleSidebar.tsx` | Home link to /app; Mission Logs link to /app/missions. |
| `src/app/console/ConsoleHomeWorkspace.tsx` | useOutletContext for composerApiRef; createMission on Send, navigate to /app/missions/:id. |

### Manual test checklist

- [ ] **/app** loads Console home (expandable composer, chips).
- [ ] **/app/missions** shows list (seeded 3 missions); status pill and time per row; click row → /app/missions/:id.
- [ ] **/app/missions/:id** shows WorkspaceHeader "Mission: &lt;title&gt;" and status pill; user prompt (if any) + PlanProposalBlock.
- [ ] **Confirm & Run** opens ExecutionDrawer; stub steps: validation → execution → report (no backend).
- [ ] **Modify** navigates to /app (focus composer can be done by user).
- [ ] **Cancel** marks mission cancelled in store and navigates to /app/missions.
- [ ] **Send from home:** type in composer, Send → mission created, navigate to /app/missions/:id; thread shows prompt and plan proposal.
- [ ] **/dashboard** and **/app/back** unchanged.
- [ ] **Build** passes.

### Rollback plan (git revert)

1. Revert Phase 2 commit(s).
2. In **App.jsx:** restore single `<Route path="/app" element={...} />` (no nested routes); restore `isConsole = pathname === '/app'`; remove imports for ConsoleHomeWorkspace, MissionLogsListView, MissionDetailView.
3. In **ConsoleShell:** restore direct render of ConsoleHomeWorkspace (no Outlet, no ConsoleProvider, no useParams/getMission); remove ExecutionDrawer step prop.
4. In **WorkspaceHeader:** remove missionTitle, missionStatus props.
5. In **ExecutionDrawer:** remove step prop and stub step content.
6. In **ConsoleSidebar:** remove Home link; set Mission Logs link back to /app if desired.
7. In **ConsoleHomeWorkspace:** remove useOutletContext, createMission, handleSend, navigate; remove useNavigate and createMission import.
8. Delete: `src/app/console/missions/missionStore.ts`, `MissionLogsListView.tsx`, `MissionDetailView.tsx`, `PlanProposalBlock.tsx`, `ConsoleContext.tsx`.
9. No auth or store-creation changes to revert.

---

## Phase 3 readiness — execution state (do not forget)

**Risk (for Phase 3, not a bug now):**  
MissionDetailView currently combines mission context, thread, proposal, and execution stub. We do **not** yet persist:

- Messages per mission  
- Step history  
- Execution state per mission  

The execution stub is **ephemeral** (ConsoleProvider only: `drawerOpen`, `drawerStep`, `openDrawerWithStub()`). That is correct for Phase 2.

**When wiring real execution (Phase 3+):**

- Move **execution state** into **missionStore** (or backend), not only ConsoleProvider.  
- Persist per mission: messages, step history, execution phase (validation / running / report).  
- Otherwise: reload loses execution state, drawer state and mission state diverge, and URL-driven state becomes unreliable.

Lock this for Phase 3: execution and thread state must be mission-scoped and persisted.
