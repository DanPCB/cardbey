# IMPACT REPORT — Global Live Pilot EOI Phase B (Public Landing)

Date: 2026-08-14  
Scope: Restore `/terms` + `/privacy`, then Phase B public EOI landing only  
Status: **PROCEED** — user authorized restore + Phase B

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Broken consent links if Terms/Privacy restore incomplete | High |
| Accidental coupling to Live Market session RSVP / badges | High |
| Public route exposed while Vite/backend flags default OFF incorrectly | Medium |
| Form field drift vs backend Zod schema | Medium |
| Feed chrome clutter from EOI CTA | Low |
| Analytics accidentally logging PII | Medium |

## (2) Why

Backend EOI API is ready (`GLOBAL_LIVE_EOI_API_READY`). Public landing + consent destinations were missing. Footer already linked `/privacy` and `/terms` without routes.

## (3) Impact scope

### In scope (Phase B)

- Restore legal pages from `a6dc3170` + register `/terms`, `/privacy`
- `/global-live` marketing landing + EOI form
- Dashboard API client for public config/submit
- Vite flag `VITE_ENABLE_GLOBAL_LIVE_EOI_V1` (master UI gate; open/closed from server)
- Marketplace entry: PublicFeedChrome + BusinessEntryRuntimePage
- Attribution, consent, analytics (no PII)
- Tests + production build

### Out of scope

- Phase C admin UI
- Live Market session registration / badges / Cloudflare
- Optional marketing-consent field (not in backend)
- Distinct duplicate UI (backend returns opaque `{ ok: true }` for soft dedupe)

## (4) Smallest safe patch

1. Checkout legal modules; add routes next to `/about`/`/pricing`
2. New `src/lib/globalLiveEoi/*` + `src/pages/public/GlobalLiveEoiLandingPage.tsx`
3. Flag-gated route + two entry CTAs with `?source=`
4. No Live Market file edits except avoiding their surfaces

---

## Confirmation

User: **Restore Terms + Privacy from a6dc3170, register routes, then implement Phase B EOI**
