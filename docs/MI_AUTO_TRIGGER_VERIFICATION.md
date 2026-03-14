# MI Assistant Auto-Trigger – Verification

## Feature flag and settings

- **Flag:** `MI_ASSISTANT_AUTO_TRIGGER` (API) or `VITE_MI_ASSISTANT_AUTO_TRIGGER=true` (env). Default: **false** in prod until validated.
- **Local settings (localStorage):**
  - `mi.autoTrigger.enabled` – default true when flag is on
  - `mi.autoTrigger.delayMs` – default 1350 (clamped 800–3000)
  - `mi.autoTrigger.cooldownMs` – default 15000
  - `mi.autoTrigger.maxPerSession` – default 3

## Enable for testing

1. Set env: `VITE_MI_ASSISTANT_AUTO_TRIGGER=true` (or enable via API `/api/v2/flags`).
2. Ensure `mi.autoTrigger.enabled` is not set to `0` in localStorage (or set `mi.autoTrigger.enabled=1`).

## Manual verification

1. **Hover product image ~1.5s → MI Assistant opens with correct suggestions**
   - Go to Store Draft Review with products.
   - Hover a product card (with `storeIdForAutoTrigger` passed) for ~1.5s.
   - Expect: MI Assistant opens, Suggestions tab, chips like “Improve this product”, “Create smart promotion”, “Generate tags”, “Generate hero”, and tip: “Based on where you hovered: &lt;product name&gt;”.

2. **Move mouse away before delay → does not open**
   - Hover a `[data-mi-hover]` element, then move away before the delay (e.g. 1.5s).
   - Expect: Panel does not open.

3. **After one auto-open, repeated hovers respect cooldown**
   - Trigger auto-open once (e.g. hover product card until panel opens).
   - Close panel, then hover again within 15s (default cooldown).
   - Expect: Panel does not open again until cooldown has passed.

4. **Close assistant → no immediate retrigger**
   - Open panel via auto-trigger, then close it with the close button.
   - Hover the same or another eligible element within 15s.
   - Expect: Panel does not open (60s “dismiss cooldown” after manual close).

5. **“Don’t show again”**
   - Auto-open the panel (e.g. via product card hover).
   - Click “Don’t show again” in the tip line.
   - Expect: `mi.autoTrigger.enabled` is set to false; further hovers do not auto-open until re-enabled.

## Eligible hover targets (data-mi-hover)

- **repair_images:** “Repair wrong images”, “Auto-fill missing images”, “Repair catalog” (and template-leak “Repair catalog”).
- **improve_dropdown:** “Improve” dropdown trigger button.
- **product_image:** Product cards when `storeIdForAutoTrigger` is passed (Store Draft Review grid).

## Files touched

- `src/lib/mi/miAutoTriggerSettings.ts` – settings + defaults
- `src/lib/featureFlags.ts` – `isMiAssistantAutoTriggerEnabled()` (existing)
- `src/hooks/useMiAutoTrigger.ts` – delegation, delay, cooldown, maxPerSession
- `src/components/mi-shell/miShell.store.ts` – `lastClosedByUserAt` for 60s dismiss cooldown
- `src/components/mi-shell/MiShell.tsx` – `useMiAutoTrigger()` integration
- `src/features/mi/MIHelperPanel.tsx` – surface suggestions + tip + “Don’t show again”
- `src/lib/mi/miCommands.ts` – clear surfaceKey when opening without auto-trigger context
- `src/state/miHelperStore.ts` – `pageRoute` on context type
- `src/features/storeDraft/StoreDraftReview.tsx` – `data-mi-hover` on repair/autofill buttons; `storeIdForAutoTrigger` on ProductReviewCard
- `src/features/storeDraft/review/ImproveDropdown.tsx` – `data-mi-hover` on trigger
- `src/features/storeDraft/review/ProductReviewCard.tsx` – `data-mi-hover` + item/store/label when `storeIdForAutoTrigger` set
