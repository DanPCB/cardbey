# Impact Report: Phase 1.5 Console UX Polish

**Scope:** UI-only polish. No backend, no flow break.

## Risk assessment

**(a) What could break**  
- None expected. Changes are limited to: ConsoleHomeWorkspace (composer expand/collapse, keyboard), ConsoleSidebar (width/strip behavior), WorkspaceHeader (pill + button), Homepage (idle timer gate). No route, auth, or store/preview changes.

**(b) Why**  
- "/" and Esc are scoped to the console workspace; "/" only when focus is not in an input/textarea. No change to RequireAuth, store creation, or preview.

**(c) Mitigation**  
- "/" handler: only trigger when `document.activeElement` is not input/textarea/select. Esc only collapses composer. Sidebar is CSS/state. Idle timer: start only after first mousemove (Option A).

**(d) Rollback**  
- Revert Phase 1.5 commit(s). Restore previous ConsoleHomeWorkspace, ConsoleSidebar, WorkspaceHeader, Homepage. No data or route changes.

---

## Files changed

| File | Change |
|------|--------|
| `src/app/console/ConsoleHomeWorkspace.tsx` | Expandable composer: collapsed (compact bar + chips) / expanded (textarea + mode + attachment + Send). "/" focuses and expands when focus not in input/textarea; Esc collapses. Exposes `ComposerApi` via `composerApiRef`. |
| `src/app/console/ConsoleSidebar.tsx` | Thin strip (12px) when not pinned and not hovered; on hover → rail (56px); on mousemove within sidebar → full (220px). Pin keeps full. |
| `src/app/console/WorkspaceHeader.tsx` | Right-side status pill "Idle"; "New mission" button that calls `onFocusComposer()`. |
| `src/app/console/ConsoleShell.tsx` | Holds `composerApiRef`, passes to ConsoleHomeWorkspace and `onFocusComposer` to WorkspaceHeader. |
| `src/pages/public/Homepage.tsx` | Idle timer starts only after first mousemove (Option A). `mouseMovedOnce` state; timer effect depends on it. Scroll/hover/focus cancel unchanged. |

---

## Manual test checklist

- [ ] **/** loads; Hero unchanged.
- [ ] **Start Free** (auth / no auth) still routes to /app or login?returnTo=/app.
- [ ] **Hero idle:** Without moving mouse, wait 5s → no redirect. Move mouse once, then wait 5s (no scroll/hover on hero) → redirect to /app or login.
- [ ] **Hero scroll** → auto-fade cancelled for visit.
- [ ] **/app** loads; sidebar is thin strip (12px) when not hovered.
- [ ] **Sidebar:** Hover left edge → expands to rail (56px); move mouse inside → expands to full (220px). Pin keeps full; unpin returns to strip when mouse leaves.
- [ ] **Composer:** Collapsed by default (compact bar "Describe what you want to run… (or press /)"); chips visible. Click or focus bar → expands to full composer.
- [ ] **"/" key** (focus not in an input) → composer focuses and expands. **Esc** → composer collapses.
- [ ] **WorkspaceHeader:** "Idle" pill and "New mission" button visible. "New mission" focuses and expands composer.
- [ ] **/dashboard** and **/app/back** unchanged.
- [ ] **Build** passes.

---

## Rollback plan

1. Revert the Phase 1.5 commit(s).
2. Restore previous versions of: `ConsoleHomeWorkspace.tsx`, `ConsoleSidebar.tsx`, `WorkspaceHeader.tsx`, `ConsoleShell.tsx`, `Homepage.tsx`.
3. No route or auth changes to revert.
