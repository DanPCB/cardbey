# Impact Report: Context-Aware Store Assistant (V1)

## Summary

Replace generic store Assistent greeting copy with a deterministic, composable greeting built from **public** business context (type, capabilities, featured opportunity, optional merchant overrides). Pure resolution/composition lives under the dashboard assistant lib; UI consumes composed output only.

## Path adaptation

Requested path `apps/core/src/lib/assistant/contextResolver/` does **not** exist in this monorepo (`apps/core/src` is absent).

**Chosen placement:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/assistant/contextResolver/`

| Why | Detail |
|-----|--------|
| Existing SSOT | Store assistant / starters / specialist config already live under dashboard `src/lib/assistant/` |
| Data already client-side | Visitor storefront loads public store via `getPublicStore`; greeting composition is pure |
| Naming collision | Root `resolveAssistantContext` in `assistantRouter.js` remains (mode/page routing). V1 business greeting API is `contextResolver/resolveAssistantContext` |

No new execution APIs; no auto-publish / billing / messaging execution. CTAs stay on existing governed concierge / assistant action paths (`autoSubmit: false`).

## What could break

1. **AIDock store greeting** — If `getAssistantContent` always prefers the new composer, stores without a registered public snapshot could lose the old specialist greeting wording.
2. **ProactiveOffer activity cards** — Welcome / collection dwell offers may change copy/actions when business context is present; existing activity tests assert specific hardcoded messages.
3. **Name confusion** — Two different `resolveAssistantContext` symbols (router vs contextResolver).
4. **assistantSettings pass-through** — Exposing a new public field incorrectly could leak non-public profile data if nested under private blobs.

## Why

- New pure modules compose greetings from structured context instead of hardcoded PIL offer strings.
- UI wiring is additive: use composed greeting when context exists; otherwise keep fallbacks.
- Merchant `assistantSettings` is read only from already-public storefront settings / business profile fields; drafts/private notes are never consumed.

## Impact scope

- **Affected:** Dashboard assistant greeting (AIDock store specialist), ProactiveOffer layout for business-aware welcomes, public storefront snapshot registration, optional public DTO passthrough for `assistantSettings`.
- **Not affected:** Performer execution, payments, campaign publish, kernel authority, admin/private APIs, Creator Studio drafts.

## Smallest safe patch

1. **Add** `src/lib/assistant/contextResolver/*` (types, templates, featured resolver, composer, context resolver, settings parser, public snapshot registry) + Vitest unit/integration tests.
2. **Wire** storefront load → `registerAssistantPublicSnapshot(store)` (public fields only).
3. **Gate composition:** `composeAssistantGreeting` / snapshot used only when `businessId` (or store id) + public snapshot exist; else fallback `"Welcome!"` / existing specialist/PIL strings.
4. **Do not rename** root `assistantRouter.resolveAssistantContext`; import V1 from `@/lib/assistant/contextResolver`.
5. **Public mapper:** pass through `storefrontSettings.assistantSettings` (or `businessProfile.assistantSettings`) only when already on the storefront settings object returned by `toPublicStore` — do not add private fields.
6. **ProactiveOffer:** when `offer.composedGreeting` is set, render Assistant Greeting Card; otherwise keep current card.

## Rollback

1. Stop calling `registerAssistantPublicSnapshot` / remove enrichment in `useActivityDetection` / `getAssistantContent`.
2. Delete `src/lib/assistant/contextResolver/` and `AssistantGreetingCard` (if added).
3. Revert ProactiveOffer optional greeting branch.

## Merchant settings (V1)

Public passthrough — no new API. Set on the business:

```json
{
  "storefrontSettings": {
    "assistantSettings": {
      "welcomeTitle": "Welcome to CA Handyman!",
      "welcomeMessage": "Need a repair today?",
      "assistantName": "Alex",
      "preferredCTA": "Request Quote",
      "featuredCampaignId": "camp_123"
    }
  }
}
```

`toPublicStore` already exposes `storefrontSettings`; the resolver reads `assistantSettings` from there or `businessProfile.assistantSettings`.

## No-parallel-stack proof

Does not add a second Intent Runtime, Broker, or MI product surface. Extends the existing dashboard assistant / PIL concierge presentation with a pure composition layer over public store data.
