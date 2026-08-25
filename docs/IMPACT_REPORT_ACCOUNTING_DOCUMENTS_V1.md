# IMPACT REPORT — Accounting Documents V1 (Closure Pass)

**Date:** 2026-08-25  
**Pass:** PARTIAL → **READY** (staging E2E closed)  
**Verdict:** `CARDBEY_ACCOUNTING_DOCUMENTS_V1_READY`

## Changes in this pass

1. Canonical Prisma migrations (postgres + sqlite) `20260825050000_accounting_documents_v1`
2. pdfkit A4 PDF from `issuedSnapshot` (owner + share-token endpoints)
3. Snapshot integrity unit/smoke (same snap → equal PDF)
4. Accept/decline hardening (idempotent, expiry, cancelled)
5. Share token length gate; recipient always uses frozen snapshot
6. Dashboard `/d/:token` recipient page + PDF/accept/decline
7. Owner UI: PDF links + mobile stacked list cards

## What could break (production promote)

| Risk | Why | Impact | Mitigation |
|------|-----|--------|------------|
| Migrate fail on prod Postgres | New tables/indexes | Core preDeploy / boot | Additive-only SQL; rollback drops documented |
| Feature off on prod | `readNonProductionFlag` defaults OFF in `NODE_ENV=production` | Routes 404 until env set | Set `ENABLE_ACCOUNTING_DOCUMENTS_V1=true` on Core prod |
| Dashboard missing UI | Vite flag / old submodule | No Quotes & Invoices / `/d/:token` | Release bumps submodule to `a2a8e2f1`; set twin flag if needed at build |
| Unrelated staging delta | Full staging→main is ~195 commits / conflicts | Broad prod risk | **Focused** `release/accounting-documents-v1` cherry-pick only |

## Staging evidence (READY gate)

- Health: `features.accountingDocuments.v1: true`
- Public probe: `share_not_found` (routes mounted)
- E2E 16/16: draft → issue → `/d/:token` → accept → convert → issue invoice → owner/public PDF (`%PDF`)

## Scope freeze

No ledger, BAS, reconciliation, reminders, partial payments, Xero/MYOB, or payment settlement in V1.

## Smallest safe promote

Branch `release/accounting-documents-v1` ← cherry-pick of accounting commits onto `main` + READY docs (not full staging merge).
