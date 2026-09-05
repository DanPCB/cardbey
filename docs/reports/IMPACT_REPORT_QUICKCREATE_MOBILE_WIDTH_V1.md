# IMPACT REPORT — QuickCreate mobile width (v1)

## Change intent

On mobile (~375–430px), Create Business / store-creation draft form cards only use ~70–75% of the thread width, leaving a large empty strip on the right. Correct parent width so the form uses available mobile width with normal gutters. Responsive layout only — no QuickCreate redesign.

## Root cause (audit)

**Not** sidebar / hamburger / reserved drawer width.

**Primary:** `AgentBubble` in `ConsoleCentreColumn.tsx` wraps agent text **and** form cards in `max-w-[72%]` (chat-bubble convention). Create-store forms inherit that cap → ~72% content + empty right gutter.

**Secondary:** Cards use `max-w-[36rem]` / `max-w-[420px]` (harmless on phone; 72% parent binds first). Legacy `CreateStoreCardPlaceholder` lacks `w-full`.

**Hamburger:** `CanonicalSidebar` mobile FAB is `position: fixed`; closed drawer is off-flow (`-translate-x-full`). Does not reserve content width.

## What could break

1. **Agent text bubble width** for messages that also carry `create_store` / `store_creation_draft` — intro line may span full thread width instead of 72%.
2. **Desktop create-store cards** may stretch to thread `max-w-[720px]` / `max-w-xl` column (still capped by card `max-w-[36rem]` / `420px`).
3. **Other form cards** unchanged if gated only to create-store types.

## Why

Widening only the bubble wrapper for create-store form types removes the chat % cap without changing UserBubble or other agent cards.

## Impact scope

- Performer console centre column — create-store / store-creation-draft agent messages only
- Mobile + desktop thread layout for those cards
- Not: sidebar, shell grid, published storefront, other formCard types

## Smallest safe patch

1. In `AgentBubble`, when `formCard.type` is `create_store` or `store_creation_draft`, use `w-full max-w-full min-w-0` instead of `max-w-[72%]`.
2. Add `w-full` to `CreateStoreCardPlaceholder` root for consistency with `StoreCreationDraftCard`.

No `100vw`, no sidebar CSS changes, no per-field width hacks.
