# Impact Report — Global Live EOI confirmation email V2 + applicant tracking

## Summary

Upgrade EOI confirmation email to an application receipt (flag-gated). Add opaque `publicReference` and optional authenticated applicant tracking limited to session `userId` + verified-email link-back. Claim-token linking is deferred.

## What could break

1. Prisma clients / DBs without the new columns fail on create/list.
2. Soft-dedupe or confirmation tests that assert exact email subject/body.
3. Feature snapshot consumers if new flags appear unexpectedly as enabled.
4. Me-route mount collisions (unlikely; new path under `/api/me/global-live`).

## Why

1. Receipt needs a stable opaque public reference and delivery status fields without exposing cuid.
2. Email V2 changes copy/CTA; must stay behind `ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2` (default OFF).
3. Tracking must not enumerate by unverified email; only `userId` and verified normalized-email association.

## Impact scope

- Core: `globalLiveEoi/*`, Prisma schemas + sqlite/postgres migrations, `features.js`, `server.js`, `.env.example`
- Dashboard: `/me/global-live-applications` page, App route, optional Me hub link, feature flag helper, i18n keys
- Email: template module + `sendEoiConfirmation` V2 path; V1 preserved when flag off

## Smallest safe patch

1. Schema: `publicReference` (unique), `confirmationEmailStatus`, `confirmationSentAt`, index on `userId`.
2. Email V2 template + flag; no re-send on soft dedupe; no PII in logs; escape HTML.
3. Tracking flag + `GET /api/me/global-live-applications` + applicant page; email track CTA only when tracking flag on.
4. Link orphan EOIs only when `user.emailVerified` and `normalizeEmail(user.email) === emailNormalized`.

## Explicitly deferred

- Signed claim-token linking
- Email outbox/retry queue
- Admin review UI changes
- Live Market RSVP / streaming
