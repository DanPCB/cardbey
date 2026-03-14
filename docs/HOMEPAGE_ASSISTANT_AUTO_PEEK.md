# Homepage Assistant Auto-Peek

## Summary

On the homepage (`/`) only, the assistant dock **slides up** on load (auto-peek) and **auto-collapses after 8 seconds** if the user does not interact. Any meaningful interaction (focus input, type, click starter, click inside dock) **cancels** the auto-collapse. After collapse, the launcher remains visible; manual reopen does not trigger another auto-close. Non-home pages and store-specialist behavior are unchanged.

---

## Impact assessment (LOCKED RULE)

- **`/` routing, assistant routing, store-specialist, `/frontscreen`, `/for-sellers`, `/create`, other flows:** Unchanged. Auto-peek and timer run only when `isHomepage && aiOpen` and only until first collapse or interaction. Safe.

---

## State model

- **aiOpen:** Controlled open/closed state (unchanged).
- **autoPeekTimerRef:** Ref holding the 8s timeout id; cleared on cleanup, on user interaction, and on manual close.
- **hasAutoPeekRunRef:** Ref, set to `true` when (a) the 8s timer fires (auto-collapse), (b) the user interacts (cancel), or (c) the user closes the dock. Once true, the 8s timer is **not** started again for that session (so manual reopen does not auto-close).
- **onUserInteracted:** Callback passed to AIDock only when `isHomepage`; AIDock calls it on focus/type/chip/button/pointer-down inside the dock. It clears the timer and sets `hasAutoPeekRunRef.current = true`.

---

## Behavior

1. **On load at `/`:** Dock opens (existing sync), slides up (homepage uses `translate-y-full` → `translate-y-0` when mounted).
2. **Timer:** If `isHomepage && aiOpen && !hasAutoPeekRunRef.current`, schedule 8s timeout to close dock and set `hasAutoPeekRunRef.current = true`. Cleanup clears the timeout.
3. **Interaction:** AIDock calls `onUserInteracted` (→ `cancelAutoPeek`) on input focus, input change/keydown, starter chip click, “Create your store” button click, and any pointer down inside the dock. Timer is cleared and `hasAutoPeekRunRef` set; no auto-collapse.
4. **Manual close:** `closeAIDock` calls `cancelAutoPeek` and `setAiOpen(false)`; same ref/timer behavior as interaction.
5. **After collapse:** Launcher stays visible; user can reopen. Reopen does not start a new 8s timer (`hasAutoPeekRunRef` already true).

---

## Files changed

| File | Change |
|------|--------|
| `pages/CardbeyFrontscreenTopNavPreview.jsx` | `AUTO_PEEK_INACTIVITY_MS = 8000`. Refs: `autoPeekTimerRef`, `hasAutoPeekRunRef`. Effect: when `isHomepage && aiOpen && !hasAutoPeekRunRef.current`, start 8s timer → set ref and `setAiOpen(false)`; cleanup clears timer. `cancelAutoPeek()` clears timer and sets ref. `closeAIDock` calls `cancelAutoPeek` then `setAiOpen(false)`. Pass `onUserInteracted={isHomepage ? cancelAutoPeek : undefined}` to AIDock. Dev logs: auto-peek opened, auto-collapse scheduled, auto-collapse cancelled (interaction), auto-collapsed. |
| `components/assistant/AIDock.jsx` | Prop `onUserInteracted`. `reportInteraction()` calls it. Call from: wrapper `onPointerDown`, input `onFocus`, input `onChange` and `onKeyDown`, starter chip `onClick`, “Create your store” button `onClick`. Homepage slide-up: when `mountPoint === 'homepage'`, initial class `translate-y-full` (then `translate-y-0` when mounted); non-homepage keeps `translate-y-2`. |

---

## Dev logs (homepage only)

- `[Homepage] auto-peek opened` — when dock is open on `/` and 8s timer is started.
- `[Homepage] auto-collapse scheduled` — with `ms: 8000`.
- `[Homepage] auto-collapse cancelled (interaction)` — when `onUserInteracted` runs.
- `[Homepage] auto-collapsed` — when 8s timeout fires and dock closes.

---

## Manual verification checklist

- [ ] **On `/`, dock slides up on load** — Visible slide-up from bottom (homepage uses `translate-y-full` → `translate-y-0`).
- [ ] **No interaction:** Dock collapses after ~8 seconds.
- [ ] **Focus input / type / click starter / click “Create your store” / click inside dock:** Auto-collapse is cancelled; dock stays open.
- [ ] **After collapse:** Launcher visible; click launcher reopens dock; it does not auto-close again after 8s.
- [ ] **Manual close (X):** Dock closes; no auto-collapse later on reopen.
- [ ] **`/frontscreen`:** No auto-peek; dock closed by default; behavior unchanged.
- [ ] **Store preview / store-specialist:** Unchanged.
- [ ] **No regressions:** Browsing, navigation, onboarding, dashboard, mission, publishing, promotion.

---

## Risks / edge cases

- **Rapid navigate away and back to `/`:** Timer is cleared on unmount; `hasAutoPeekRunRef` is not reset, so returning to `/` opens the dock but does not start a new 8s timer. Intentional: “run auto-peek on initial homepage load only.”
- **Timer and close race:** If user closes right as the 8s timer fires, both run; ref and state updates are safe.
- **Double fire:** Pointer-down on a chip fires both chip `onClick` and wrapper `onPointerDown`; `cancelAutoPeek` is idempotent.
