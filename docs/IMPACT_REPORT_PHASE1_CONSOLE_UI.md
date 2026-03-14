# Impact Report: Phase 1 AI-First Console UI

**Date:** Phase 1 implementation.  
**Scope:** New `/app` Console route, ConsoleShell layout, Hero “Start Free” behavior.  
**LOCKED RULE:** Assess risk before coding; warn first.

---

## Step 1: Routing & Layout Inspection

### Stack

- **Framework:** Vite + React (not Next.js). No App Router or Pages Router.
- **Routing:** `react-router-dom` v6 in a single `Routes` block in `App.jsx`.
- **Route file:** `apps/dashboard/cardbey-marketing-dashboard/src/App.jsx`.

### Current /app and /dashboard

| Route | Implementation |
|-------|----------------|
| `/app` | **Single route** at ~line 1088: `<Route path="/app" element={<Navigate to="/app/back" replace />} />` — redirects to back office. |
| `/app/back` | Parent route with `<RequireAuth><BackOffice /></RequireAuth>`. BackOffice renders its own sidebar + `<Outlet />`. Nested: dashboard, missions/:missionId/chat, campaigns, content, etc. |
| `/dashboard` | Standalone route: `<RequireAuth><DashboardHome /></RequireAuth>`. Uses `PageShell` with sidebar when `loc.pathname === '/dashboard'`. |
| `/app/store/:storeId/review` | StoreReviewGate + StoreReviewPage (store creation workflow). |
| `/app/store/:storeId/publish-review` | RequireAuth + StorePublishReviewPage. |
| `/app/performer/*`, `/app/creative-shell/*`, etc. | Other /app/* routes; all more specific than `/app`. |

React Router v6 matches by path specificity. More specific paths are declared above the generic `/app` redirect, so:

- `/app/back`, `/app/store/123/review`, `/app/performer/...` continue to match their existing routes.
- Only the **exact** path `/app` will be changed to render the new Console.

### Safest place to add /app

- **Replace** the existing `<Route path="/app" element={<Navigate to="/app/back" replace />} />` with a new route that renders `<RequireAuth><ConsoleShell /></RequireAuth>` (or a thin wrapper that renders ConsoleShell + ConsoleHomeWorkspace).
- **Do not** add a new parent route for `/app/*` that could change matching for `/app/back` or `/app/store/*`.
- **Layout:** In `App.jsx`, when `pathname === '/app'`, the app must **not** wrap content in `PageShell` (no existing Sidebar/rightbar). Add an `isConsole` flag (e.g. `loc.pathname === '/app'`) and include it in the same branch as `isBackOffice` so `/app` renders without PageShell and Console provides its own shell.

---

## Risk Assessment (What Could Break)

### (a) What could break

1. **Users or bookmarks for `/app`**  
   Today they are sent to `/app/back`. After change they will see the new Console. Intentional product change; back office remains at `/app/back`.

2. **Hero CTA “Start Free”**  
   Currently `<Link to="/signup">`. Changing to “go to Console or login with returnTo=/app” alters the signup funnel (fewer direct signup hits from hero). Acceptable per product direction.

3. **Layout for `/app`**  
   If we do **not** treat `/app` like back office for layout, the app will wrap `/app` in `PageShell` + existing `Sidebar` (dashboard nav). That would show two sidebars (dashboard + console) or wrong chrome. So we must add `isConsole` and render `/app` without PageShell.

4. **Store creation (French Baguette E2E)**  
   Store review is at `/app/store/:storeId/review`. We are not changing that route or any store/preview routes. No changes to StoreReviewPage, StoreReviewGate, CreatePage, or preview routes. **Risk: none** if we only add `/app` and Console components and do not touch store/preview/auth logic.

5. **Auth**  
   `/app` will use `RequireAuth` like `/app/back`. Unauthenticated users redirect to `/login?returnTo=/app`. No change to RequireAuth or login flow. **Risk: low.**

### (b) Why

- (1)–(2) Product and UX change by design.
- (3) Current layout branch is “if isBackOffice (or login, performer, etc.) → no PageShell”. Without `isConsole`, `/app` would fall into “else → PageShell” and get the wrong shell.
- (4)–(5) No edits to store creation, preview, or auth code.

### (c) Mitigation

- Add **only** the new `/app` route and Console UI; leave `/app/back`, `/app/store/*`, `/dashboard`, and all other routes unchanged.
- Add `isConsole = (loc.pathname === '/app')` and use it in the layout condition so `/app` does not use PageShell.
- Hero: replace “Start Free” link with a handler that checks auth and navigates to `/app` or `/login?returnTo=/app`; optionally start 5s idle timer; cancel auto-fade permanently on scroll for that visit.
- Keep signup reachable from login page so funnel is not broken.

### (d) Rollback plan

- Revert the commit(s) that add Phase 1 Console.
- Restore `<Route path="/app" element={<Navigate to="/app/back" replace />} />`.
- Restore Hero “Start Free” to `<Link to="/signup">` and remove any idle timer/scroll logic.
- Remove `isConsole` from `App.jsx`.
- Delete or leave unused: `ConsoleShell`, `ConsoleSidebar`, `WorkspaceHeader`, `ExecutionDrawer`, `NotificationBell`, `ConsoleHomeWorkspace`, and any new `/app` page file.
- After revert: `/app` again redirects to `/app/back`; Hero again goes to signup; no Console UI.

---

## Implementation Plan (Order of Work)

1. **Add Console components** (new files only):  
   `ConsoleShell`, `ConsoleSidebar` (hover + pin), `WorkspaceHeader`, `ExecutionDrawer` (stub), `NotificationBell` (placeholder), `ConsoleHomeWorkspace` (welcome message, chips, input, mode toggle, attachment button).

2. **App.jsx:**  
   - Add `isConsole = (loc.pathname === '/app')`.  
   - Include `isConsole` in the condition that skips PageShell (same branch as `isBackOffice`).  
   - Replace `<Route path="/app" element={<Navigate to="/app/back" replace />} />` with `<Route path="/app" element={<RequireAuth><ConsoleShell /></RequireAuth>} />` (ConsoleShell internally renders ConsoleHomeWorkspace).

3. **Homepage.tsx:**  
   - “Start Free” CTA: use auth check; if authed → navigate to `/app`, else → `/login?returnTo=/app`.  
   - Optional: 5s idle timer to navigate to `/app` (or login) with simple fade; cancel timer on hover/focus/click; **cancel auto-fade permanently for that visit if user scrolls**.

4. **Verification:**  
   - `/` loads; Start Free routes correctly; `/app` loads Console; `/dashboard` and `/app/back` unchanged; store creation/preview/auth untouched; build passes.

---

## Files to Add (new)

- `src/app/console/ConsoleShell.tsx`
- `src/app/console/ConsoleSidebar.tsx`
- `src/app/console/WorkspaceHeader.tsx`
- `src/app/console/ExecutionDrawer.tsx`
- `src/app/console/NotificationBell.tsx`
- `src/app/console/ConsoleHomeWorkspace.tsx`

## Files to Modify

- `App.jsx` — isConsole, /app route, RequireAuth for /app.
- `src/pages/public/Homepage.tsx` — Start Free CTA + optional idle timer + scroll-cancel.

No changes to: store review, preview, auth guards, BackOffice, dashboard, or any existing /app/* routes.

---

## Phase 1 Deliverables (Completed)

### Files added

| File | Purpose |
|------|--------|
| `src/app/console/ConsoleShell.tsx` | Layout: sidebar + workspace + execution drawer (structural). |
| `src/app/console/ConsoleSidebar.tsx` | Hidden until hover; pin toggle at top of rail; Mission Log / Settings / Log out links. |
| `src/app/console/WorkspaceHeader.tsx` | "Current Mission Context" / "No active mission." |
| `src/app/console/ExecutionDrawer.tsx` | Structural right panel (width 0 when closed); stub content when open. |
| `src/app/console/NotificationBell.tsx` | Bell icon placeholder; comment re lazy LLM. |
| `src/app/console/ConsoleHomeWorkspace.tsx` | Welcome message, 5 suggestion chips, multi-line input, mode toggle (Pipeline / AI Operator), attachment button, Send. |

### Files modified

| File | Change |
|------|--------|
| `App.jsx` | Import ConsoleShell; `isConsole = (pathname === '/app')`; include isConsole in no-PageShell branch; replace `/app` route with `<RequireAuth><ConsoleShell /></RequireAuth>`. |
| `src/pages/public/Homepage.tsx` | Import getTokens; goToConsole() (auth check → /app or /login?returnTo=/app); "Start Free" button onClick=goToConsole; 5s idle timer with scroll-cancel (permanent for visit); cancel timer on hero hover/focus. |

### Quick manual test checklist

- [ ] **/** loads — Hero / marketing homepage renders.
- [ ] **Start Free (unauthenticated)** — Click → redirects to `/login?returnTo=%2Fapp`. After login, lands on `/app` if returnTo is honored.
- [ ] **Start Free (authenticated)** — With valid token, click → navigates to `/app` (Console).
- [ ] **Idle 5s on Hero** — Do not scroll/hover/focus; after ~5s → navigate to `/app` or login.
- [ ] **Scroll on Hero** — Scroll the page once → auto-fade is cancelled for that visit (no navigate after 5s).
- [ ] **Hero hover/focus** — Hover or focus hero → idle timer cancelled (no auto-fade).
- [ ] **/app** — Loads Console: sidebar (hover to reveal, pin toggle), WorkspaceHeader "No active mission.", welcome message, chips, input, mode toggle, bell, drawer closed.
- [ ] **/dashboard** — Unchanged; still shows DashboardHome with existing layout.
- [ ] **/app/back** — Unchanged; still shows BackOffice with its sidebar and dashboard.
- [ ] **Store creation** — No changes to `/app/store/:storeId/review`, `/create`, or preview routes; E2E (e.g. French Baguette) untouched.
- [ ] **Build** — `pnpm run build:dashboard` passes.

### Rollback plan (git revert)

1. Revert the commit(s) that introduced Phase 1 Console.
2. Restore in `App.jsx`:  
   `<Route path="/app" element={<Navigate to="/app/back" replace />} />`  
   and remove `isConsole`, ConsoleShell import, and isConsole from the layout condition.
3. Restore in `Homepage.tsx`: "Start Free" as `<Link to="/signup">` with the button inside; remove getTokens import, goToConsole, idle timer, scroll listener, cancelIdleFade, and hero onMouseEnter/onFocus.
4. Optionally delete the new files under `src/app/console/` (or leave unused).
5. After revert: `/app` again redirects to `/app/back`; Hero "Start Free" goes to signup; no Console UI.
