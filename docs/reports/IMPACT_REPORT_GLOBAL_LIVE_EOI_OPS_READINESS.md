# IMPACT REPORT — Global Live EOI Operational Readiness Batch

Date: 2026-08-14  
Scope: Consent-version persistence, legal registry (DRAFT-honest), confirmation email V2, publicReference wiring, delivery status idempotency, thin admin UI, health DTO, tests/E2E evidence  
Status: **PROCEED** — user authorized operational-readiness batch  
Verdict target: **PARTIAL** (legal remains DRAFT; broadcasting stays non-operational)

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Create fails if `publicReference` required but unset (schema already ahead of service) | High |
| Soft-dedupe / route tests break on email subject or new fields | Medium |
| Admin UI leaks PII on public routes | High — admin-only |
| Inventing APPROVED legal text | High — **forbidden**; keep DRAFT |
| Full email outbox absent → duplicate sends on retry | Medium — mitigate via row `confirmationEmailStatus` |
| Historical migration edits | High — **forbidden**; additive migrations only |
| Mailer `bypassEnableGate` still blocked by transporter ENABLED check | Medium — local fix |

## (2) Why

Ops cannot audit consent versions, cite opaque references, or review EOIs in UI. Schema already has `publicReference` + confirmation columns unused by create. Terms/Privacy are DRAFT and must stay labelled as such.

## (3) Impact scope

### In scope
- Additive consent evidence columns + new PG/SQLite migrations
- Server-authoritative consent registry + text hash
- Core legal document registry (DRAFT) + health reporting
- Wire `publicReference` + confirmation status; V2 email templates; honest CTAs
- Column-level email idempotency (no full outbox yet — documented)
- Thin Control Center admin page + health endpoint
- Tests + disposable E2E script/evidence

### Out of scope
- Approving legal documents
- Applicant status tracking page (“Track your application”)
- Live Market / Cloudflare / broadcasting
- Broad lockfile/hoisting fixes
- Marketing export / auto-accept

## (4) Smallest safe patch

1. Migration: consent* nullable columns  
2. `consentEvidence.js` + `legalRegistry.js` (core)  
3. Service: set publicReference + consent + write delivery status  
4. `confirmationEmailTemplates.js` + update `sendEoiConfirmation`  
5. Admin list filters + GET by id + `/health`  
6. Dashboard `GlobalLiveEoiAdminPage` flag-gated  
7. Tests + E2E with disposable data  

## Stop conditions acknowledged

- No inventing approved legal copy  
- No historical migration edits  
- Email: use existing columns as idempotency boundary; document that durable outbox remains deferred  

## Confirmation

User: operational-readiness batch brief (proceed).
