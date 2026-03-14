# Impact Report: Sidebar Refactor — Icon-First, Hover Expand, Pin Toggle

**Scope:** ConsoleSidebar only (used when `isConsole`: `/app`, `/app/missions`). No changes to legacy layout Sidebar, App.jsx routes, auth, or backend.

## Risk assessment

**(a) What could break**
- **Navigation:** If a sidebar link points to a wrong or removed route, users get 404 or wrong page. Console-only users rely on Home, Mission Logs, Settings, Log out today.
- **French Baguette E2E / store creation / preview / auth:** No code in those paths is changed. Sidebar is UI-only under `/app` (ConsoleShell).
- **/app/back, /dashboard, /app/store/\***: Not modified. We only add links from the sidebar to existing routes; we do not change when PageShell vs ConsoleShell is rendered.

**(b) Why**
- New nav items use existing routes from App.jsx (`/app/back`, `/catalog`, `/orders`, `/promo`, `/app/creative-shell`, `/insights`, `/loyalty`, `/menu`, `/devices`, `/account`, `/settings`, `/logout`). Risk is limited to typos or future route renames.

**(c) Mitigation**
- Use exact route strings that already exist in App.jsx. No route renames. Pin state in localStorage key `cardbey.sidebar.pinned` (no conflict with PageShell’s `cardbey.sidebar.pinned` used for open/collapsed—we use same key for “pinned open” for Console).
- Active state via `useLocation().pathname`; no change to router.

**(d) Rollback**
- Revert `ConsoleSidebar.tsx` and remove `SidebarItem.tsx` if added. Restore previous ConsoleSidebar (strip/rail/expand, 4 items: Home, Mission Logs, Settings, Log out). No other rollback needed.

---

## Refactor plan (minimal)

1. **ConsoleSidebar.tsx**
   - Default width: 56px (icon-only). Remove 12px strip; “hover on left edge” = hover over the 56px sidebar expands to 220px.
   - Pin: read/write `localStorage.getItem('cardbey.sidebar.pinned')` (persist `'true'`/`'false'`). When pinned, width always 220px; when unpinned, collapse to 56px on mouse leave.
   - Smooth CSS transition for width (e.g. 200ms). Labels fade in with opacity/transition when expanded.
   - Pin toggle button at top (icon only when collapsed; tooltip “Pin sidebar” / “Unpin sidebar”).
   - Three sections: **Console** (Home `/app`, Mission Logs `/app/missions`), **Business** (Business Builder `/app/back`, Catalog `/catalog`, Orders `/orders`, Promotions `/promo`, Content Studio `/app/creative-shell`, Insights `/insights`, Loyalty `/loyalty`, Menu `/menu`, Devices `/devices`), **System** (Account `/account`, Settings `/settings`, Log out `/logout`).
   - Section labels: small caps, muted color, only when expanded. Max 12 visible items recommendation: we have 14; use subtle grouping so the list is scannable.
   - Active item: `useLocation()`; apply distinct background (e.g. `bg-muted`) for the link whose `to` matches current path (prefix match for nested routes where appropriate).
   - Tooltips: when collapsed (width 56px), each nav item shows a tooltip on hover (e.g. title attribute or a small Tooltip component).

2. **SidebarItem component (new)**
   - Props: `to`, `icon` (ReactNode), `label`, `collapsed` (boolean).
   - Renders `Link` with icon; when `!collapsed` shows label. When `collapsed`, `title={label}` for tooltip. Active when `location.pathname === to` or (for /app/back) `pathname.startsWith(to)`.

3. **No duplication**
   - Single Settings and single Log out in System section. No other Settings entry.

4. **Routes**
   - All links use existing paths only; no new routes, no renames.

5. **Legacy routes**
   - `/app/back`, `/dashboard` remain as-is. Sidebar link “Business Builder” → `/app/back`; no change to BackOffice or dashboard rendering.

---

## Deliverables

- Updated `ConsoleSidebar.tsx` (icon-first, 56px default, hover → 220px, pin with localStorage, 3 sections, active state, tooltips when collapsed).
- New `SidebarItem.tsx` (optional; can be inlined in ConsoleSidebar for minimal diff).
- Manual test checklist and rollback steps (below).

---

## Files changed

- **Added:** `apps/dashboard/cardbey-marketing-dashboard/src/app/console/SidebarItem.tsx` — nav link with icon, label, tooltip when collapsed, active state.
- **Modified:** `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ConsoleSidebar.tsx` — icon-first 56px default; hover → 220px; pin in `localStorage`; Console / Business / System sections; all links to existing routes.

---

## Manual test checklist

- [ ] **Console entry:** Open `/app` (logged in). Sidebar is ~56px, icons only; no labels.
- [ ] **Tooltips:** In collapsed state, hover each icon; tooltip shows (e.g. "Home", "Mission Logs", "Business Builder", "Settings", "Log out").
- [ ] **Hover expand:** Move cursor over sidebar → width animates to 220px; section labels (Console, Business, System) and item labels appear.
- [ ] **Unpin / collapse:** With sidebar expanded (not pinned), move cursor away → sidebar collapses to 56px.
- [ ] **Pin:** Click pin icon at top → sidebar stays 220px after mouse leave. Click again (unpin) → sidebar collapses when mouse leaves.
- [ ] **Pin persistence:** Pin sidebar, refresh page → sidebar still expanded. Unpin, refresh → still collapsed.
- [ ] **Active state:** On `/app` → Home has distinct background. On `/app/missions` → Mission Logs has distinct background. On `/app/back` (after navigating) → Business Builder would be active when that route is used from elsewhere (Console is not mounted on `/app/back`).
- [ ] **Navigation:** From `/app`, click Mission Logs → `/app/missions`. Click Business Builder → `/app/back`. Click Catalog → `/catalog`. Click Settings → `/settings`. Click Log out → `/logout`. No 404s, no wrong pages.
- [ ] **Routes unchanged:** `/dashboard`, `/app/store/*`, `/preview/*`, auth flows unchanged. No regression on French Baguette E2E if run.

---

## Rollback

1. Revert `ConsoleSidebar.tsx` to the previous version (strip/rail/expand, 4 items: Home, Mission Logs, Settings, Log out).
2. Remove `SidebarItem.tsx` if no longer used.
3. No changes to `App.jsx`, routes, auth, or backend; no other rollback needed.
