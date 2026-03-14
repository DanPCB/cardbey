# AI / Help Bubble Recovery Report

**Date:** 2026-03-11  
**Scope:** Public/frontscreen AI chat bubble and help bubble — recover and stabilize as the first universal intent entry point.  
**Rule:** No changes to store creation, mission console, onboarding, publishing, promotion flows, or existing public/frontscreen browsing behavior.

---

## 1. Root cause: why the bubble was missing or unreliable

### 1.1 Architecture (pre-recovery)

- **Single page:** All frontscreen behavior lives in `CardbeyFrontscreenTopNavPreview.jsx` (route `/frontscreen`).
- **Two content modes:**
  - **Slides mode** (`?mode=slides`): Renders `BackgroundFeed` (vertical slideshow). Long-press is attached to the slideshow div via `useLongPress(onLongPress)`; `onLongPress` opens `ContextHelpBubble` and sets help state. The 💬 button in `RightIcons` opens `AIDock`.
  - **Stores mode** (default; `?mode=products`, `?mode=food`, etc.): Renders `StoreReelsFeed` (vertical reels of stores). **No long-press handler** was attached to this view, so the tip “Long-press anywhere to get a help bubble” did not work on the main Explore/Products experience.
- **ContextHelpBubble** and **AIDock** are always mounted at the root of the page; visibility is controlled by `help.open` and `aiOpen`. So the **AI Dock** could be opened by the 💬 in RightIcons in both modes, but:
  - The **right-side icon stack** (RightIcons) is easy to miss (no dedicated floating control).
  - **Long-press** only worked in slides mode, not in stores mode.

### 1.2 Exact failure points

| Issue | Cause |
|-------|--------|
| Long-press not opening help bubble on Explore/Products | Long-press handler existed only on `BackgroundFeed`’s div; `StoreReelsFeed` had no `onLongPress` prop or handlers. |
| Help bubble “missing” for many users | Tip promised “long-press anywhere” but that was only true in slides mode; in stores mode long-press did nothing. |
| No single obvious entry point | Only the 💬 in the right icon stack opened the dock; no dedicated floating button. |
| No observability | No dev logging for mount, open/close, or context. |

**No regressions identified** to store creation, mission console, onboarding, publishing, or promotion flows; changes are limited to the frontscreen page and one frontscreen child component.

---

## 2. Current architecture (post-recovery)

- **ContextHelpBubble:** Opens on long-press (slides + stores reels). “Ask AI” closes the bubble and opens AIDock. Auto-closes after 6s. `z-50`, `role="dialog"`.
- **AIDock:** Bottom sheet with greeting, starter prompt chips, and free-text input. Opens via: (1) 💬 in RightIcons, (2) new **floating AI button** (bottom-right), (3) “Ask AI” in ContextHelpBubble, (4) Alt+/. `z-50`.
- **Floating AI button:** Fixed bottom-right (above tip), always visible on frontscreen. One tap opens AIDock. Graceful fallback when long-press is not used.
- **Long-press in stores mode:** `StoreReelsFeed` accepts optional `onLongPress`; when provided, the same long-press behavior as slides is applied to the reels scroll container. Scroll is preserved (long-press only fires after threshold without significant movement).
- **Starter prompts in AIDock:** “Find products or services”, “Ask this store”, “What is trending?”, “Help me create a store” (static placeholders; backend can be wired later).
- **Dev observability:** With `localStorage.cardbey_debug_frontscreen_mount === '1'`: mount/unmount of the bubble layer, ContextHelpBubble open, AIDock open/close. No logging in production by default.

---

## 3. Files changed

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/CardbeyFrontscreenTopNavPreview.jsx` | Mount logging; `openAIDock` / `closeAIDock` with optional logging; pass `onLongPress` into `StoreReelsFeed`; floating AI button (fixed bottom-right); `ContextHelpBubble` `onAsk` → `openAIDock`; `AIDock` receives `feedContext` and `feedType`, starter prompts, and open logging; tip copy updated; `ContextHelpBubble` open logging and `role`/`aria-label`. |
| `apps/dashboard/cardbey-marketing-dashboard/src/components/frontscreen/StoreReelsFeed.jsx` | Optional `onLongPress` prop; local `useLongPress`; spread long-press handlers on root when `onLongPress` is provided. |

**No other files modified.** No backend, mission, onboarding, or promotion code touched.

---

## 4. Minimal patch summary

- **StoreReelsFeed:** Optional `onLongPress`; minimal `useLongPress`; attach handlers to the scroll container only when `onLongPress` is passed.
- **CardbeyFrontscreenTopNavPreview:**  
  - Pass `onLongPress` to `StoreReelsFeed` that sets `help` state (same shape as slides).  
  - Add a fixed bottom-right floating button that calls `openAIDock`.  
  - Use `openAIDock` / `closeAIDock` for RightIcons 💬 and AIDock close; add optional dev logs.  
  - AIDock: starter prompt chips, greeting text, and open log when debug flag is set.  
  - Tip: “Tap 💬 (right side or bottom-right) or long-press anywhere for help • Alt + / opens assistant …”.  
  - ContextHelpBubble: open log when debug flag is set; `role="dialog"` and `aria-label="Help bubble"`.

---

## 5. Follow-up risks and limitations

- **Floating button vs. tip:** Button is above the tip area; if the tip is made larger or position changes, layout may need a small tweak.
- **Backend:** Starter prompts are placeholders; connecting “Find products or services”, “Ask this store”, etc., to real APIs is out of scope for this recovery.
- **Context-aware prompts:** `feedContext` and `feedType` are passed into AIDock for future use; no behavior change yet.
- **Other routes:** Bubble and dock are only on `/frontscreen`. Homepage or other public pages are unchanged; adding the bubble there would be a separate, additive change.

---

## 6. Manual verification checklist

Use this to confirm recovery and rule out regressions.

### 6.1 Bubble and entry points (frontscreen)

- [ ] **Floating button visible** on `http://localhost:5174/frontscreen` and `http://localhost:5174/frontscreen?mode=products` (bottom-right, purple/violet circle with 💬).
- [ ] **Click floating button** opens the AI Dock (bottom sheet with “Cardbey Assistant”, starter chips, and input).
- [ ] **Click 💬 in the right icon stack** opens the same AI Dock.
- [ ] **Close** via Dock’s ✕ closes the dock; overlay does not trap the page.
- [ ] **Long-press** on the Explore/Products reels view (hold ~0.5s without scrolling) opens the contextual help bubble (“Need help with this? Ask Cardbey…”).
- [ ] **“Ask AI” in help bubble** closes the bubble and opens the AI Dock.
- [ ] **“Not now” / click outside** closes the help bubble.
- [ ] **Alt + /** (desktop) toggles the AI Dock open/closed.
- [ ] **Tip text** mentions “Tap 💬 (right side or bottom-right) or long-press anywhere for help” and “Alt + /”.

### 6.2 Slides mode (no regression)

- [ ] With `?mode=slides`, long-press on the slideshow still opens the help bubble.
- [ ] Slideshow scroll/swipe and tap behavior unchanged.

### 6.3 Stores / Explore (no regression)

- [ ] Explore feed still shows stores; scrolling and snap behavior unchanged.
- [ ] Tapping a store card still opens the store (e.g. preview page).
- [ ] “Buy now” and QR on store cards still work.

### 6.4 Other flows (no regression)

- [ ] **Navigation:** Home, Create, Explore, Pricing, About, Sign in, Create with AI still work.
- [ ] **Store preview:** Opening a store from Explore and using the public store page is unchanged.
- [ ] **Mission console / onboarding / publishing / promotions:** Not touched; no testing required for this recovery, but smoke-check if desired.

### 6.5 Dev observability (optional)

- [ ] Set `localStorage.setItem('cardbey_debug_frontscreen_mount', '1')`, reload frontscreen, and check console for: “AI/help bubble layer mounted”, “Context help bubble opened” (after long-press), “AIDock opened” / “AIDock closed” when opening/closing the dock.

---

## 7. Later extensions (out of scope for this recovery)

- Connect starter prompts to buyer intent or discovery APIs.
- Show different chips by context (e.g. “Ask this store” when coming from a store page).
- Mount the same bubble/dock on homepage or other public routes.
- Replace demo replies with real assistant/backend.

---

*Recovery is limited to the frontscreen AI/help bubble and dock; all changes are additive or localized to the frontscreen and StoreReelsFeed.*
