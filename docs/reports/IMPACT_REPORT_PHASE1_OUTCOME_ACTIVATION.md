# IMPACT REPORT — Phase 1 real-user outcome activation

Date: 2026-08-17  
Status: **implementing** (user requested audit then implementation in one pass)  
Scope: new-user Quick Start (`/start`), Miniweb + Digital Card experiments, attribution/events  
Does **not** mix with discovered-business Activation Funnel (ingestion GTM)

---

## (1) What could break

| Risk | Severity |
|------|----------|
| `/start` or Create heading changes steal existing `/create` / Global Create users | Medium |
| Guest draft claim races with new card-claim-on-auth | Medium |
| Public event ingest spam or PII in analytics | Medium |
| Digital card persist via `buildCard` creates indexed/public businesses | High if miswired — must only write `Card`, never `Business` |
| Loyalty/display cards advertised as working systems | High (truth) |
| Control Center Activation Funnel counts mixed with seed GTM | Medium |
| `POST /api/cards/from-activation` colliding with `/:cardId` | Low if registered first |

## (2) Why

New users currently hit a capability-heavy Create sheet or `/create` store job. Facebook needs outcome URLs. Attribution spine is **flag-off by default**, so visit beacons often no-op.

## (3) Impact scope

- Public: `/start`, `/start/card`, `/start/loyalty`, `/start/display`; `/create?capability=miniweb`
- Core: `POST /api/public/activation/events`, `GET /api/admin/activation/funnel`, `POST /api/cards/from-activation`
- Control Center funnel page: **additional labeled section** only
- Global Create sheet, Performer, seed activation runway: **untouched**

## (4) Smallest safe patch

1. New landing + deep links; reuse `/create` + guest store draft/claim for Miniweb.
2. Digital card: client preview → save/sign-in → existing `buildCard` (Card table only).
3. Loyalty/display: truthful interstitial pages, not Facebook primary ads.
4. JSON sidecar events (not Prisma, not Meta). Dedupe. No PII.
5. Extend first-party attribution envelope; do not enable live Facebook publishing.
