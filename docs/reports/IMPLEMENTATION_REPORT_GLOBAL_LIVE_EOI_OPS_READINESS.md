# IMPLEMENTATION REPORT — Global Live EOI Operational Readiness Batch

Date: 2026-08-14  
Impact: `docs/reports/IMPACT_REPORT_GLOBAL_LIVE_EOI_OPS_READINESS.md`

## Verdict: **PARTIAL**

| Label | Status |
|-------|--------|
| `GLOBAL_LIVE_EOI_CONSENT_AUDIT_READY` | **Claimable for local** — server consent evidence + SQLite consent migration applied + unit tests. Restart core after generate to load new client. |
| `GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_READY` | **Not claimed** — receipt template shipped + sync send + row idempotency; real responsive inbox inspection not completed in this batch. |
| `GLOBAL_LIVE_EOI_PUBLIC_LANDING_READY` | **Not claimed** — legal documents remain **DRAFT**; production build/hoisting not cleared; broadcasting non-operational. |

Broadcasting / translation / Cloudflare: **not operational** (`broadcastingOperational: false`).

---

## Exact files changed (primary)

### Core
- `prisma/{sqlite,postgres,root}/schema.prisma` — consent* columns
- `prisma/{sqlite,postgres}/migrations/20260814230000_global_live_eoi_consent_evidence/migration.sql`
- `src/lib/globalLiveEoi/consentEvidence.js` (+ test)
- `src/lib/globalLiveEoi/legalRegistry.js`
- `src/lib/globalLiveEoi/health.js`
- `src/lib/globalLiveEoi/confirmationEmailTemplates.js` — receipt design default
- `src/lib/globalLiveEoi/sendEoiConfirmation.js` — status + idempotent skip
- `src/lib/globalLiveEoi/service.js` — publicReference, consent, delivery status, list filters, get, me-list
- `src/lib/globalLiveEoi/domain.js` — admin DTO consent + businessLink
- `src/lib/globalLiveEoi/routes.js` — health, get by id, search filters
- `src/services/email/mailer.js` — bypass transporter + masked logs
- `scripts/e2e-global-live-eoi-ops.mjs`

### Dashboard
- `src/lib/legal/documentRegistry.ts` — DRAFT registry + readiness helper
- `src/lib/globalLiveEoi/adminApi.ts`
- `src/pages/controlCenter/GlobalLiveEoiAdminPage.tsx`
- `src/components/controlCenter/controlCenterRoutes.ts`
- `src/App.jsx` — `/control-center/global-live-eoi`

### Docs
- `docs/reports/IMPACT_REPORT_GLOBAL_LIVE_EOI_OPS_READINESS.md`
- this file

---

## Schema / migrations

Additive nullable columns (no historical migration edits, no consent backfill):

- `consentVersion`, `privacyVersion`, `termsVersion`, `consentLocale`, `consentContext`, `consentTextHash`

Existing (prior V2 migration): `publicReference` (unique), `confirmationEmailStatus`, `confirmationSentAt`.

---

## Consent evidence stored (new creates)

| Field | Value |
|-------|--------|
| consentVersion | `global-live-eoi-consent-v1` |
| privacyVersion | `cardbey-privacy-policy-v0.1-draft` |
| termsVersion | `cardbey-platform-terms-v0.1-draft` |
| consentLocale | `en` \| `vi` (from language) |
| consentContext | `GLOBAL_LIVE_EOI` |
| consentTextHash | SHA-256 of canonical server text |

Client-supplied version fields are ignored. Legacy rows → `consentEvidence.label: legacy_unversioned`.

---

## Legal registry

Status: **DRAFT** for Terms + Privacy.  
Routes: `/terms`, `/privacy`. Locales: `en`, `vi`.  
No APPROVED invention. Production readiness remains blocked on authorised legal approval.

---

## Email subjects / CTAs

**VI subject:** `Cardbey đã nhận hồ sơ đăng ký thí điểm Global Live của bạn`  
**EN subject:** `Cardbey has received your Global Live pilot application`

Public status in body: **Received / Đã nhận**. Selection disclaimer present. Broadcasting called out as not operational.

| Condition | Primary CTA |
|-----------|-------------|
| Tracking off, no linked business | Create your Cardbey account to prepare your business |
| Tracking off, linked business | Update your Cardbey business |
| Tracking on + linked user | View application status (+ secondary update business) |

“Track your application” only when `ENABLE_GLOBAL_LIVE_EOI_APPLICANT_TRACKING_V1` is on.

### Delivery / idempotency

- Send only after successful create (`created: true`); soft-dedupe does not re-send.
- Row `confirmationEmailStatus === 'sent'` → skip (sync idempotency).
- Failures write `failed` / `skipped`; EOI row kept.
- Logs: masked recipient; no rendered body.
- **Full outbox/retry queue still deferred** (documented stop-condition mitigation).

---

## Admin

| Item | Detail |
|------|--------|
| Route | `/control-center/global-live-eoi` |
| Auth | `PlatformAdminRoute` + core `requireAuth` + `requireAdmin` + EOI v1 |
| API | `GET/PATCH /api/admin/global-live/registrations`, `GET .../:id`, `GET /health` |
| Features | list/filter/search, detail, consent evidence, email status, linked/unlinked business, status transitions |

No public exposure of admin fields. No bulk export / auto-accept / Live Market enrol.

---

## Runtime health (admin)

Includes: master flag, EOI open, DB probe, email provider ready, confirmation flags, `legalReadiness`, consent registry version, `applicationOperational`, `emailOperational`, `broadcastingOperational: false`. No secrets.

---

## Real E2E evidence

- Disposable probe: `scripts/e2e-global-live-eoi-ops.mjs` → **GLOBAL_LIVE_EOI_OPS_PROBE_PARTIAL_OK** (submit + soft-dedupe against localhost:3001).
- Admin cookie lifecycle, inbox responsive inspection, closed-flag flip, cross-store rejection: **manual remaining** (restart core with new code recommended before claiming email/admin green).

---

## Tests

- Core `src/lib/globalLiveEoi/**`: **39 passed**
- Dashboard legal + controlCenterRoutes: **8 passed**
- Production dashboard `vite build`: run separately; prior workspace hoisting risk remains — **do not claim landing READY** on build alone.

---

## Remaining blockers

1. Legal Terms/Privacy **DRAFT** (authorised approval required).  
2. Confirm SMTP delivery + 375px email inspection with disposable address.  
3. Restart core so create path always writes consent + publicReference + delivery status under the new client.  
4. PG migrate deploy in staging/prod.  
5. Workspace node_modules/hoisting issue for production build (diagnose separately).  
6. Durable email outbox still deferred.  
7. Broadcasting / translation remain intentionally off.
