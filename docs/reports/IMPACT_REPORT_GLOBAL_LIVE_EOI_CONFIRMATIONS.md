# IMPACT REPORT — Global Live EOI post-submit Email + SMS

Date: 2026-08-14  
Scope: Confirmation email + SMS to registrant after successful EOI create on `/global-live`  
Status: **PROCEED** — user requested delivery after form submit  
Surface: Global Live Pilot EOI only (not Live Market session RSVP / Batch B)

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Submit returns 5xx if mail/SMS throws | High |
| Soft-dedupe path re-sends confirmations on every retry | Medium |
| Accidental customer messaging from staging without kill switch | Medium |
| SMS fails for non-E.164 VN numbers (`045…` vs `+84…`) | Medium |
| Coupling to Live Market host/session notification Batch B | High (avoid) |
| PII (email/phone) in logs | Medium |

## (2) Why

`submitEoiRegistration` persists + returns opaque `{ ok: true }` only. Core has SMTP via `sendMail`; SMS has no production adapter (Twilio TODO in messageScheduler). Product needs registrant confirmation after “Đăng ký thí điểm”.

## (3) Impact scope

### In scope

- Best-effort confirmation **after `created: true` only** (not soft-dedupe)
- Email via existing `sendMail` (`bypassEnableGate: true` for transactional)
- Thin Twilio SMS helper (HTTP); skip when `TWILIO_*` missing
- Kill switch `ENABLE_GLOBAL_LIVE_EOI_CONFIRMATIONS` (default **ON** when unset → product sends; set `false` to silence)
- No change to public API response shape

### Out of scope

- Live Market session / host / guest RSVP notifications
- Platform-wide SMS for smartDocument scheduler
- Admin “notify selected” workflows
- Guaranteeing delivery when SMTP/Twilio misconfigured

## (4) Smallest safe patch

1. `services/sms/sendSms.js` — Twilio Messages API; `{ ok, skipped }` never throws
2. `lib/globalLiveEoi/sendEoiConfirmation.js` — compose VI/EN copy; fire email + SMS
3. Call from `submitEoiRegistration` after create; catch/log without failing create
4. Tests: mock senders; assert create still 201; dedupe does not re-notify

---

## Confirmation

User: Email and SMS need to be sent to registered user after submit the form (Global Live EOI screenshots).
