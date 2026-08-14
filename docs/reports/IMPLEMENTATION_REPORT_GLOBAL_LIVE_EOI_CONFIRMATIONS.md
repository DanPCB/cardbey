# IMPLEMENTATION REPORT — Global Live EOI Email + SMS Confirmations

Date: 2026-08-14  
Status: **IMPLEMENTED** (core)  
Impact: `docs/reports/IMPACT_REPORT_GLOBAL_LIVE_EOI_CONFIRMATIONS.md`

## What shipped

After a **new** EOI create (`created: true`), core best-effort sends:

1. **Email** — SMTP via existing `sendMail` (`bypassEnableGate: true`) — **active**
2. **SMS** — Twilio path kept, **opt-in** via `ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_SMS` (**default OFF**)

Soft-dedupe re-submits do **not** re-notify. Delivery failures never fail the `201` response.

## Files

| File | Role |
|------|------|
| `lib/globalLiveEoi/sendEoiConfirmation.js` | Copy + orchestration |
| `services/sms/sendSms.js` | Twilio adapter + VN/AU E.164 |
| `lib/globalLiveEoi/service.js` | Call after create |
| `*.test.js` | Unit + route assertions |

## Env

| Variable | Purpose |
|----------|---------|
| `ENABLE_GLOBAL_LIVE_EOI_CONFIRMATIONS` | Kill switch (default **on**) |
| `ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_SMS` | EOI SMS (default **off**) |
| `MAIL_HOST` / `MAIL_*` | Required for email |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Required when SMS flag is on |

Local: SMTP active for email; SMS deferred until Twilio SMS-capable From number + flag `true`.

## Tests

`19` EOI tests passed (`routes` + `domain` + `sendEoiConfirmation`).

## Ops note

Restart **cardbey-core** so the new confirmation path loads. Re-submit with a **fresh email** (or wait past soft-dedupe window) to trigger send.
