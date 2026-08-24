# SPACE SOCIAL + CONNECTION LAYER V1

**Verdict target:** `SPACE_SOCIAL_CONNECTION_LAYER_V1_PARTIAL` until live rendered cohort verified  
**Date:** 2026-08-25  
**Depends on:** Space Profile Foundation V1  
**Frozen:** Global Marketplace layout; SpaceShell / compact header structure

---

## Architecture audit

See also `docs/IMPACT_REPORT_SPACE_SOCIAL_CONNECTION_LAYER_V1.md`.

| Layer | Canonical | Space V1 |
|-------|-----------|----------|
| Content activity | No SpaceActivity table yet | Shows + Live (+ personal media) with `provenance` |
| Business follow | `StoreFollow` / store-engagement | `SpaceFollowButton` |
| User↔user connect | Missing | Prepared empty + suggestions soft-fetch |
| Contacts | `/api/contacts-sync/*` | Bridge in Connections; no address book |
| Commercial tab | Archetype heuristics | Shop / Menu / Services / Offers + safe CTAs |
| Live | Public live-session GET | LIVE NOW / UPCOMING / RECENT buckets |
| Store | `/s/:slug` | Unchanged commercial destination |

---

## Semantic fixes (MMM Fashion class bugs)

1. Tagline / About **never** become Content “Business update”.
2. Catalog items **never** auto-appear in Content — only commercial tab.
3. Offering images only when item-associated; otherwise text card (“No image”).
4. Fashion → **Shop** + CTA **View** (not Buy unless capability).
5. Finance → **Services** + **Enquire** / Book consultation when supported.

---

## Connection / contact foundation

- Follow: existing engagement API (no new table).
- Connections tab: privacy-safe suggestions when API returns Cardbey identities; otherwise clean empty + Performer entry for owner sync.
- No silent contact upload from web Space.
- No fake viewer counts; contacts ≠ viewers.

---

## Deferred (not READY blockers for PARTIAL)

- Persisted `SpaceActivity` / publish events
- User↔user CONNECT graph table
- Peer Message (do not reuse agent chat)
- Follow notification emit
- Full Live Market mount if still flag-gated
- Device contact permission UX (mobile)

---

## Tests

- `spaceProfileFoundation.test.ts` — provenance + archetype + no fake feed
- Existing SpaceIdentityHeader / SpaceHero tests

---

## Live verification checklist (required for READY)

- [ ] MMM Fashion: no tagline-as-update; Shop tab; Content empty or shows-only
- [ ] AWE Financial: Services; Enquire/Book; no truck invent in Content
- [ ] Restaurant/cafe: Menu terminology
- [ ] Trade/service: Services + Request quote
- [ ] Personal Space: Connections empty/safe; Content from personal media only
- [ ] Desktop + mobile
- [ ] Global `/` unchanged
- [ ] Visit store still canonical
