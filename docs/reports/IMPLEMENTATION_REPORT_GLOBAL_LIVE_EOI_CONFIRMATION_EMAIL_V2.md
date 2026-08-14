# Implementation Report — Global Live EOI confirmation email V2 + applicant tracking

## Verdict

| Surface | Verdict |
|---------|---------|
| Confirmation email V2 | **PARTIAL** |
| Applicant tracking | **PARTIAL** |

Not `GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_READY`: no real Gmail mobile delivery verification in this session.  
Not `GLOBAL_LIVE_EOI_APPLICANT_TRACKING_READY`: API/page/tests exist, but live authenticated journey + admin status change were not manually verified.

Applying does not guarantee selection. Global Live broadcasting and translation are not yet operational.

## Exact files changed (primary)

### Core
- `apps/core/cardbey-core/src/lib/globalLiveEoi/confirmationEmailTemplates.js` — V1/V2 builders, required VI/EN subjects/preheaders, tracking-gated CTAs
- `apps/core/cardbey-core/src/lib/globalLiveEoi/sendEoiConfirmation.js` — delivery + row-level idempotency (`confirmationEmailStatus === 'sent'`)
- `apps/core/cardbey-core/src/lib/globalLiveEoi/sendEoiConfirmation.test.js`
- `apps/core/cardbey-core/src/lib/globalLiveEoi/flags.js` — `ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2`, `ENABLE_GLOBAL_LIVE_EOI_APPLICANT_TRACKING_V1` (default OFF)
- `apps/core/cardbey-core/src/lib/globalLiveEoi/publicReference.js` — opaque `GL…` references
- `apps/core/cardbey-core/src/lib/globalLiveEoi/domain.js` — applicant status mapping + `toApplicantEoiDto`
- `apps/core/cardbey-core/src/lib/globalLiveEoi/service.js` — publicReference on create, confirmation delivery audit, `listMyEoiApplications` + verified-email link
- `apps/core/cardbey-core/src/lib/globalLiveEoi/routes.js` / `routes.test.js` — `GET /api/me/global-live/applications`
- `apps/core/cardbey-core/src/server.js` — mount me routes
- `apps/core/cardbey-core/src/config/features.js` + `.env.example`
- `apps/core/cardbey-core/src/services/email/templates/globalLiveEoiConfirmation.js` — re-export
- Prisma schemas + `20260814220000_global_live_eoi_public_reference` migrations (sqlite/postgres)

### Dashboard
- `apps/dashboard/.../pages/me/GlobalLiveEoiApplicantApplicationsPage.tsx`
- `App.jsx` route `/me/global-live-applications`
- `lib/globalLiveEoi/featureFlags.ts` — tracking flag helper
- `i18n/globalLiveResources.js` — applicant EN/VI copy

### Docs
- `docs/reports/IMPACT_REPORT_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2.md`
- this file

## Existing infrastructure reused

- `sendMail` (sync SMTP; no outbox — documented gap)
- Soft-dedupe (no second confirmation on duplicate submit)
- `publicWebBase()` for absolute URLs
- `optionalAuth` / `requireAuth` patterns (mirror Live Market me routes)
- Domain status enum + applicant-facing mapping
- MarketingLayout + RequireAuth for applicant page

## Final email copy (V2, flag ON)

### Vietnamese
- **Subject:** Cardbey đã nhận hồ sơ đăng ký thí điểm Global Live của bạn
- **Preheader (no tracking):** Hồ sơ của bạn đã được nhận. Xem các bước tiếp theo và chuẩn bị doanh nghiệp của bạn trên Cardbey.
- **Preheader (tracking ON):** …Theo dõi trạng thái hồ sơ…
- **Heading:** Cảm ơn bạn — hồ sơ đã được nhận
- **CTA (no tracking / unlinked):** Tạo tài khoản Cardbey miễn phí
- **CTA (tracking + linked userId):** Xem trạng thái hồ sơ (+ secondary create/update business)

### English
- **Subject:** Cardbey has received your Global Live pilot application
- **Preheader (no tracking):** Your application has been received. Review the next steps and prepare your business on Cardbey.
- **CTA:** Create a free Cardbey account / View application status when tracking + linked

Receipt shows: status Received, business, pilot corridor, publicReference, submittedAt, preferred language, presentation types. HTML escapes applicant content. Plain-text alternative included.

## Applicant-linking design

1. **Session bind** — if authenticated at submit, `userId` stored.
2. **Verified email match** — on `GET /api/me/global-live/applications`, orphan rows with matching `emailNormalized` are linked only when `user.emailVerified === true`.
3. **Claim tokens** — deferred (too large for this batch).
4. Public reference alone never grants access.

## Status mapping (central)

| Internal | Applicant status | Label (EN) |
|----------|------------------|------------|
| SUBMITTED | received | Received |
| UNDER_REVIEW | reviewing | Under review |
| SHORTLISTED | shortlisted | Shortlisted |
| SELECTED | selected | Selected for the pilot |
| WAITLISTED | waitlisted | Waitlisted |
| DECLINED | closed | Not selected this round |
| WITHDRAWN | withdrawn | Withdrawn |

Confirmation email always presents **Received** for the receipt moment.

## Privacy / security

- No rendered email bodies stored; only `confirmationEmailStatus` / `confirmationSentAt`
- Logs omit PII (ids/reference/pilot only)
- Applicant DTO excludes admin notes, scores, emails, phones, descriptions, internal cuid
- Soft-dedupe does not re-send confirmation
- Tracking flag required for me API + track wording in email

## Tests

- `sendEoiConfirmation.test.js` — 11 passed (VI/EN V2, escape, tracking CTA, V1 fallback, idempotent skip)
- `routes.test.js` — me applications auth/flag, linked rows, verified-email claim, public endpoints leak check
- Rate-limit mocked in route tests for isolation

## Build / manual

- Production build / live Gmail mobile: **not run**
- Manual E2E checklist items 1–10: **not completed** in this environment

## Remaining gaps

1. Enable `ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2=true` in a non-prod env and send a real EOI to Gmail mobile.
2. Apply Prisma migrations for `publicReference` / confirmation columns if not yet applied.
3. Enable `ENABLE_GLOBAL_LIVE_EOI_APPLICANT_TRACKING_V1` and verify `/me/global-live-applications` end-to-end (signup returnTo, cross-user denial, admin status update).
4. Claim-token linking for anonymous applicants who never verify matching email.
5. Email outbox/retry (still fire-and-forget SMTP).
6. Privacy/Terms remain DRAFT for public-launch legal readiness (orthogonal).
