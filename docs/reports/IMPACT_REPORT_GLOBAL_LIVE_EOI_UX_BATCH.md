# Impact Report — Global Live EOI public UX / release-readiness batch

## Summary

Focused UX and contract fixes for `/global-live` only. Does not touch Live Market RSVP, streaming, or host participant UI.

## What could break

1. Soft-dedupe clients that assert `res.body === { ok: true }` exactly.
2. EOI submit that previously bound any client `storeId` for authenticated users without ownership checks.

## Why

1. Public API will return `{ ok: true, alreadyReceived: true }` on soft dedupe so the landing page can show a duplicate-safe state without enumeration (same 201; only the submitter of that email sees the flag).
2. Binding `storeId` without verifying `Business.userId === session` is an ownership gap.

## Impact scope

- Core: `globalLiveEoi/service.js`, `routes.js`, route tests
- Dashboard: EOI landing page, `globalLiveEoi` client/validation/i18n, landing tests
- Legal: Privacy route already exists (DRAFT) — no fabricated legal text

## Smallest safe patch

- Backend ownership check via `prisma.business.findFirst({ id, userId })`; reject invalid `storeId` with validation field key.
- Opaque `alreadyReceived` boolean on success response.
- Landing: header scroll-margin, form groups, business selector, FAQ disclosure, capacity wording, success CTAs, duplicate UI, SEO meta.

## Not in scope / remaining

- Consent **version** column (schema has `consentGranted` + `consentAt` only)
- Full manual E2E against live admin API (environment-dependent)
- Legal approval of Privacy/Terms drafts
