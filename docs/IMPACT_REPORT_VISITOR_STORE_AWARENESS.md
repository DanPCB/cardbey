# Impact Report: Visitor Store Awareness (QR / public assistant)

**Date:** 2026-07-19  
**Status:** Proposed (awaiting approval before code)  
**Related:** Context-Aware Store Assistant V1 (`contextResolver/`) is **greeting composition**, not live awareness.

## Phase A — Shipped (2026-07-19)

Approved and implemented:

1. **Core** `attachPublicStoreAwarenessSignals` — after public DTO build, attaches visitor-safe `loyaltyPrograms`, `campaigns`/`activeCampaigns`, `promotions`/`activeOffers` (active/live only). Wired via `resolvePublicStoreFromArtifact`.
2. **Dashboard** `buildVisitorStoreAwareness` — ranks live signals (loyalty → campaign → promotion → catalog badge); drives greeting `featured` tip.
3. Flag: `VITE_ENABLE_VISITOR_STORE_AWARENESS` (default **true**).
4. Copy uses “available / live” — **not** “just launched” (reserved for Phase B event feed).
5. CTAs remain governed (scroll / ask Performer); no auto-join loyalty or auto-book.

### Tests
- Core: `src/utils/__tests__/attachPublicStoreAwarenessSignals.test.js`
- Dashboard: `src/lib/assistant/contextResolver/visitorStoreAwareness.test.ts`

## Intent

Visitors who scan a store QR (or open `/s/:slug`) should be told what is **actually new or active** at that business — e.g. “loyalty just launched”, “Summer renovation package is live” — by **observing current public state and recent public events**, not by merchant-typed welcome strings or hardcoded business-type templates.

## What V1 is today (gap)

| Layer | Behavior |
|-------|----------|
| Type templates | Fixed copy per restaurant / service / … |
| `assistantSettings` | Optional **merchant-hardcoded** welcome / preferred CTA |
| Featured picker | Reads campaigns/promos/products **if** already on the public store DTO |
| CTA | Scroll section or ask Performer — not process guidance |
| Loyalty / “just launched” | **Not** modeled as awareness |
| Owner Business Awareness | Owner-only snapshot; **must not** be reused for guests |

So V1 can *sound* aware when a campaign happens to be on the DTO; it is **not** an awareness capability.

## Target capability

```
Public store load (QR)
  → VisitorStoreAwarenessSnapshot (observe only)
      • live public signals (campaigns, offers, loyalty joinable?, catalog badges)
      • recent public store events (launched package, loyalty published, …)
  → Rank “what to suggest now” (1 primary tip)
  → Compose into Assistant greeting featured + actions
  → CTA → guided handoff (later slice; confirm before book/order)
```

### Non-negotiables

1. **Public / visitor-safe only** — no owner analytics, quote pipelines, private drafts.
2. **Observe → Infer → Suggest → Confirm** — never auto-book / auto-order / auto-join loyalty money side effects.
3. **No second Intent Runtime** — wrap existing public store + PIL / concierge presentation.
4. **Not hardcoded welcomes** — merchant `welcomeMessage` remains optional override, never the awareness source of truth.
5. **Wrap existing Business Awareness for owners** — do not leak owner facts; visitor path is a **separate public projection**.

## Phased build (user scope: public signals now + event feed next)

### Phase A — Public live signals (smallest awareness slice)

**Goal:** Derive suggestions from what the public storefront already (or can safely) expose.

Candidate signals (only if present & public/active):

| Signal | Example suggestion |
|--------|-------------------|
| Active / pinned campaign | “Summer renovation package is on — view it” |
| Active promotion / hot deal | “Today’s special / hot deal” |
| Public loyalty program joinable | “New loyalty program — join & earn stamps” |
| Recently published catalog item with `isNew` / badge | “Just added …” |
| Booking/order capability + empty featured | Soft capability tip (not fake “new”) |

**Work:**

1. Add `VisitorStoreAwareness` types + `buildVisitorStoreAwareness(publicStore)` pure module next to `contextResolver/` (or `lib/pil/visitorAwareness/`).
2. Extend public DTO projection **only if missing**: active campaigns, joinable loyalty summary (`{ id, name, status: active, joinedAt? }` public-safe), offer list already used by storefront.
3. Rank one primary tip → map into `AssistantFeatured` (replace priority that today only looks at campaign lists without loyalty).
4. Wire into `composeAssistantGreeting` / enrich path so QR welcome uses **awareness tip** when present; else current template fallback.
5. Tests: loyalty launch → tip; campaign live → tip; expired/draft → ignored; no tip → generic welcome.

### Phase B — Public store activity / event feed

**Goal:** True “just created / just launched” language from durable events, not only current inventory.

| Event (examples) | Emitted when |
|------------------|--------------|
| `loyalty_program_published` | Owner publishes loyalty (Level 3+ confirm already done) |
| `campaign_launched` | Campaign goes live |
| `offer_activated` | Offer published |
| `package_published` | Service package / catalog bundle published |

**Work:**

1. Thin append-only **public** event projection (Core), capped + TTL (e.g. last 14 days, max N events), store-scoped.
2. Include on public store GET or `GET /api/public/stores/:id/activity` (visitor-readable).
3. Visitor awareness merges **live signals + recent events** (events win for “just launched” copy when fresh).
4. No private mission/owner briefing data on this endpoint.

## What could break

1. **Public API shape** — adding loyalty/campaign fields could change storefront payloads (keep additive).
2. **False “new” claims** — without events, using only “active” may say “new” incorrectly → Phase A copy must say “available / live”, reserve “just launched” for Phase B timestamps/events.
3. **Privacy** — accidental use of owner `BusinessAwarenessSnapshot` on visitor path.
4. **Greeting flash** — awareness not ready → keep existing defer-until-snapshot pattern.
5. **Hardcoded settings regression** — awareness tip must outrank template fluff but not wipe merchant-forced featured campaign id when explicitly set (optional: settings pin wins).

## Impact scope

- **Affects:** QR / public storefront assistant greeting featured tip; optional public store DTO fields; later Core public activity projection.
- **Does not affect:** Owner briefing, payments, auto-publish, Marketplace feed without a store snapshot.

## Smallest safe first patch (Phase A only)

1. Impact approved.
2. Pure `buildVisitorStoreAwareness` + rank + unit tests (no API change if DTO already has campaigns/offers).
3. If loyalty missing from public DTO: **minimal** public loyalty summary in Core `toPublicStore` (active joinable only).
4. Wire tip → `composedGreeting.featured` on welcome offers.
5. Copy: “Live now” / “Available” — not “just launched” until Phase B.

## Rollback

Feature-flag `VITE_ENABLE_VISITOR_STORE_AWARENESS` (default on in staging after ship); disable → V1 template greeting only.

## No-parallel-stack proof

Extends V1 `contextResolver` + public store projection. Does not create a second MI Runtime, Intent Runtime, or owner awareness path for guests.
