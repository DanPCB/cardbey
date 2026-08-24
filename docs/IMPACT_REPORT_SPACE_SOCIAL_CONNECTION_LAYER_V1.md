# IMPACT REPORT — Space Social + Connection Layer V1

**Date:** 2026-08-25  
**Depends on:** `SPACE_PROFILE_FOUNDATION_V1` (dashboard PR #169 / monorepo #197–#198)  
**Frozen:** Global Marketplace visual layout; SpaceShell / identity header structure (improve below-header only)

## Architecture audit (summary)

| System | Status | Space V1 action |
|--------|--------|-----------------|
| Space Content feed | PARTIAL — tagline + catalog projected as fake posts | **Fix:** provenance-only activity; remove synthetic updates |
| `StoreFollow` + store-engagement APIs | EXISTS | **Reuse** for business Follow |
| User↔user Connect graph | MISSING | **Prepare UI**; no new DM system |
| Contact sync (hashed) | EXISTS (`/api/contacts-sync/*`) | **Bridge** into Connections; no address-book exposure |
| Live Market public session | PARTIAL (flag/mount) | Soft project LIVE NOW / UPCOMING / RECENT |
| SpaceActivity table | MISSING | **Defer schema** — project Shows/Live with provenance; no invent |
| Shop/Menu/Services labels | PARTIAL heuristics | Strengthen via archetype + offering CTAs |
| Agent chat threads | EXISTS (wrong domain) | **Do not** reuse for social Message |

## What could break

1. **Content emptiness** — Removing tagline/catalog-as-feed may leave Content empty for stores with only catalog (correct; empty state must be clean).
2. **Follow toggle** — Wiring `StoreFollow` on Space must not break feed engagement or invent follower counts.
3. **Contacts** — Surfacing suggestions must never render raw phone/email from device contacts.
4. **CTA copy** — Archetype-aware labels must not claim Buy/Order/Book unless store capability supports it.
5. **Schema** — No destructive migrations in this phase.

## Why

Foundation V1 left Content as a presentation projection (tagline → “Business update”, offerings → feed). That violates social semantics. Connection/follow already exist for stores; Space must consume them without cloning Facebook.

## Impact scope

| Area | Change |
|------|--------|
| Global `/` | None |
| SpaceShell / header chrome | Additive Follow/Connect actions only |
| Space Content tab | Semantic fix (provenance filter) |
| Commercial tab | Labels + CTA semantics |
| Connections tab | Follow counts + contact-suggestion bridge |
| Core Prisma | **No new tables this phase** |
| Live | Projection polish only |

## Smallest safe patch

1. Content = Shows + Live (+ personal media) with `provenance` field; drop `projectBusinessUpdate` and offering→feed.
2. Commercial tab: archetype labels + safe CTAs; offerings stay here only.
3. Business Follow via existing store-engagement follow API; counts from summary.
4. Connections: suggestions from contacts-sync when authed; privacy-safe empty otherwise.
5. Document deferred: SpaceActivity table, UserConnect, peer Message, Live auto-invite.

## Rollback

Revert dashboard submodule bump; feed returns to Foundation projection (including synthetic update).
