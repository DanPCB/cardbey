# Impact Report: PIL Context, Presence, and Routing Correction

## Summary

PIL currently retains store identity across route transitions via module snapshots, ConciergeHost prop re-injection on `/`, match-all when `pageStoreId` is null, and uncleared zustand proactive/concierge stores. This correction makes **PIL visible context = current verified route context**, with Cardbey platform as default and store scope only on verified store-bound routes.

## Root causes (traced)

1. **`resolvePilConciergeHostProps('/')` re-passes `snap.storeId` / `storeName`** onto the global feed after leaving a store.
2. **`ConciergeHost` clears suggestions only on Store A→B**, not Store→platform (`pinKey` null).
3. **`conciergeSuggestionMatchesPageStore`**: when `pageStoreId` is null, **any** suggestion is accepted → stale store cards on feed.
4. **`proactiveOfferStore` / snapshot registries** not cleared on leave.
5. **No monotonic context generation** on greeting / LLM / activity offer paths → late async can overwrite.
6. **Split visual mounts** (PilAssistant + SharedPIL + Storefront dock) are intentional; chrome is gated — keep one orchestration controller, do not add a second assistant product.

## What could break

1. Owner-facing platform welcome that currently names `resolveWelcomeStoreId` / first owned store may become more generic on `/` (intentional for visitor; owner path may keep owned-store guidance only when `isOwnerOrAdmin` and still not treat it as “active public store context”).
2. Activity offers on feed may reduce if they previously depended on leaked storeId.
3. Stricter suggestion matching may drop orphan suggestions without `storeId` on storefront (fail closed).

## Impact scope

- Dashboard PIL / Concierge / activity / assistant contextResolver wiring.
- Docs under `docs/pil/`.
- **Not:** Performer, DraftStore, Mission 1000 runway, publish, billing.

## Smallest safe patch

1. Add `resolvePILContext({ pathname, routeParams, verifiedStore, scanContext })` — platform by default; allow-list store routes.
2. Add `pilContextGeneration` (monotonic) + `assertActivePilContext` for async results.
3. On every route/scope change: release store bindings, clear concierge + proactive offer, bump generation, emit `pil_context_changed` / release/acquire events.
4. Fix feed ConciergeHost props: **never** forward last storeId in platform mode.
5. Fix suggestion accept: platform rejects store-scoped suggestions; storefront requires matching storeId.
6. Tests for Store→feed, A→B, stale discard, invalid slug, refresh.
7. Architecture doc: `docs/pil/PIL_CONTEXT_AND_PRESENCE_ARCHITECTURE.md`.

## No-parallel-stack proof

Extends existing AppShell `PilAssistant` + module context store. No second chat product, no Performer rewrite, no Mission 1000 runway change.
