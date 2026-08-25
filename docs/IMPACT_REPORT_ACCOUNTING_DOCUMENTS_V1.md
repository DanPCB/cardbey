# IMPACT REPORT — Accounting Documents V1 (Closure Pass)

**Date:** 2026-08-25  
**Pass:** Close PARTIAL → READY gates without expanding scope

## Changes in this pass

1. Canonical Prisma migrations (postgres + sqlite) `20260825050000_accounting_documents_v1`
2. pdfkit A4 PDF from `issuedSnapshot` (owner + share-token endpoints)
3. Snapshot integrity unit/smoke (same snap → equal PDF)
4. Accept/decline hardening (idempotent, expiry, cancelled)
5. Share token length gate; recipient always uses frozen snapshot
6. Dashboard `/d/:token` recipient page + PDF/accept/decline
7. Owner UI: PDF links + mobile stacked list cards

## What could break

| Risk | Mitigation |
|------|------------|
| Staging migrate conflict | Additive-only SQL; rollback drops documented |
| PDFkit missing in slim images | Already in package.json deps |
| Token probing | Uniform `share_not_found`; min length 20 |

## Staging migration evidence (required for READY)

Operator steps after merge of core PR:

```bash
cd apps/core/cardbey-core
prisma migrate deploy   # postgres schema used on staging
prisma generate
# healthz / readiness
```

Verify tables exist: BusinessBillingProfile, AccountingDocument, AccountingDocumentLine, AccountingDocumentShare, AccountingDocumentSequence.

Local empty-DB `migrate deploy` on sqlite fails on older migration history (unrelated `20260711080337_init`) — **do not** use empty sqlite as staging proof. Use staging postgres.

## Verdict

`CARDBEY_ACCOUNTING_DOCUMENTS_V1_PARTIAL`

**Exact blocking gate:** staging migration applied + staging E2E (scenarios 1–8) + desktop/mobile live QA.

All code gates for PDF, recipient page, accept/decline, and snapshot immutability are implemented pending that deploy.
