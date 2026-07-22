# Impact Report: Store PIL not appearing

## Root causes (verified)

1. **Appear timer required a window-level gesture** — immersive store video often never fires `window` scroll; without click/touch, `isStorefrontAssistantPageReady` stays false and the greeting never schedules.
2. **`welcome_hello` cooldown is global (1h)** — after seeing PIL on any store/feed, storefront welcome returns null forever for that session hour.
3. **`debugSurface: 'preview'`** when activity snapshot surface is `store_preview` disables `activityDetectionEnabled` even for edge cases where visitor flags race.

## Smallest safe patch

1. Start the 5s appear clock when the public snapshot becomes ready (context-ready → timer), not only on first gesture.
2. Scope welcome-offer cooldowns by `storeId` on storefront.
3. Resolve storefront Concierge props so public visitors never get `debugSurface: 'preview'`.

## What could break

- Auto-appear without tap may feel more proactive (intended for storefront).
- Owners still do not get auto greeting (`isOwnerOrAdmin`); Help dock unchanged.
