# Impact Report: Context-Aware Store Assistant V1 not appearing (staging)

## Root cause (proven by code path, before rewrite)

Two disconnects prevent composed V1 greetings from reaching the visible ProactiveOffer card:

### 1. Concierge props freeze (primary — wiring)

`PilAssistant` memoizes `resolvePilConciergeHostProps(pathname)` on **pathname only**:

```ts
useMemo(() => resolvePilConciergeHostProps(location.pathname), [location.pathname]);
```

`resolvePilConciergeHostProps` reads `getPilActivityContextSnapshot()` (module-level). `WebsitePreviewPage` writes that snapshot **after** mount via `usePilActivityContext`, but updating the module store does **not** re-render `PilAssistant`, and the memo still returns the first (often `storeId: null`, `isPublicVisitor: undefined`) props.

Effect:

- `useActivityDetection` receives `storeId: null` (or never enables / enables without business id).
- `enrichProactiveOfferWithStoreGreeting` bails when `!businessId` → returns **unchanged** `help_screen_dwell` copy:  
  `"Looks like you're checking out this collection..."`

Snapshot registration on `PublicStoreSlugRoute` can succeed while enrichment never receives the same `businessId`.

### 2. QR entry does not land on PublicStoreSlugRoute (entry)

Staging entry via QR (`/q/:publicCode` → `PrintBagLandingPage`) navigates with `getPublicStorefrontUrl(storeId)` → `/preview/store/:id?view=public` (**StorePreviewPage**), not `/s/:slug`.

V1 registration (`useRegisterAssistantPublicSnapshot`) only runs on `PublicStoreSlugRoute`. Preview/public path never registers a snapshot.

Dynamic QR `redirectUrl` may hit `/s/:slug`, but disconnect (1) still applies on cold load.

## What could break

1. More frequent activity offers on `/s/:slug` once props update correctly (previously under-enabled).
2. QR “View store” URL changes from `/preview/store/:id` to `/s/:slug` when slug is known — preferred canonical route.
3. Short delay before first storefront proactive greeting while context is `loading` (intentional — no generic flash).

## Why

Reactivity + route wiring bugs; resolver composition itself is fine (34 tests).

## Impact scope

- Dashboard: `pilContextStore`, `PilAssistant`, `useActivityDetection`, enrich hold/precedence, QR/storefront registration, PrintBag CTA URL.
- Not affected: Intent Runtime, backend APIs, publish/billing.

## Smallest safe patch

1. Make `pilContextStore` subscribe-able; `PilAssistant` uses `useSyncExternalStore`.
2. Re-enrich at offer **show** time; on storefront, defer generic welcome/dwell until snapshot ready or unavailable.
3. Register snapshot from `WebsitePreviewPage` when `publishedPublicStore` is present.
4. Prefer `/s/:slug` when slug known for QR view-store navigation.
5. Temporary `[ContextAwareAssistantV1]` / `[AssistantV1]` console markers.

## No-parallel-stack proof

Still one assistant surface (ProactiveOffer + contextResolver). No new Intent Runtime or second concierge stack.
