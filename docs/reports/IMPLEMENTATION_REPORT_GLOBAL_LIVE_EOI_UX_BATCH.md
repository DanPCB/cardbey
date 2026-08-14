# Implementation Report — Global Live EOI public UX batch

## VERDICT

**PARTIAL**

Applying does not guarantee selection. Global Live broadcasting and translation are not yet operational.

`GLOBAL_LIVE_EOI_PUBLIC_LANDING_READY` is **not** claimed: Privacy/Terms remain DRAFT (not legally approved), consent **version** is not persisted, and live admin-API / full manual E2E was not executed in this environment.

## What shipped

### Header / anchors
- Shared `.scroll-mt-header` / `--scroll-mt-header` tied to `--header-height`
- Sections (hero, how it works, pilot details, apply, FAQ) use scroll-margin
- Primary CTA scrolls to `#apply`, focuses heading/first field, respects reduced motion
- `scrollToElement` no-ops safely when `scrollIntoView` is unavailable (jsdom)

### Legal
- Consent links to `/terms` and `/privacy` (canonical in-app routes)
- Both routes render; Privacy is an explicit **technical draft** pending legal review
- Consent unchecked by default; marketing consent not bundled into required acknowledgment

### Business association
- Signed-out: manual business fields only; no arbitrary store binding
- No owned store + Yes: informational path; create CTA on success
- Exactly one owned store + Yes: auto-associate that store; clear name display; optional prefill (no silent overwrite of filled EOI fields)
- Multiple owned stores + Yes: required selector (name + helpful location/category; no visible IDs)
- Backend: `storeId` bound only after `prisma.business.findFirst({ id, userId })`; unowned → validation
- Success CTAs: Update (`getOverviewRoute`) / Create (`/for-sellers`) / Manage (`/app/back`)
- Never mutates business, enrols Live Market, or navigates to `/app/back/live-market` from EOI submit

### Duplicate
- API: `{ ok: true, alreadyReceived: boolean }` (soft dedupe does not rewrite existing row)
- UI: distinct duplicate heading/body (EN/VI); rapid double-submit lock

### Capacity / form / a11y / i18n / SEO
- “Pilot selection target: N businesses” (not remaining spots)
- Fieldsets: Contact / Business / Idea / Consent (EN + VI)
- FAQ: button + `aria-expanded` / `aria-controls`
- Localized titles/meta; canonical `/global-live` without attribution query params
- Telemetry: pilot/attribution/locale/signed-in/result only — no PII

## Tests run (this session)

| Suite | Result |
|-------|--------|
| Dashboard `GlobalLiveEoiLandingPage.test.tsx` | 10 passed |
| Dashboard `globalLiveEoi.test.ts` | 7 passed |
| Dashboard Privacy + Terms pages | 2 passed |
| Dashboard i18n contract + related (batch) | 293 passed in prior combined run |
| Core `globalLiveEoi/routes.test.js` | 9 passed |
| Core Live Market domain + registration domain | 30 passed |
| Live admin E2E / production build | **Not run** |

## Remaining blockers

1. **Legal content** — Privacy (and Terms) are DRAFT; not legally approved for public-launch claims
2. **Consent version** — DB has `consentGranted` + `consentAt` only; no `consentVersion` column
3. **Migration/deployment** — EOI flags + migrations must be applied in the target environment
4. **Manual E2E** — real submit → `GET /api/admin/global-live/registrations` → duplicate → mobile/desktop not verified here
5. **Admin review UI** — out of scope; list API verification only when env available
