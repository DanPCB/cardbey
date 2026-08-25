# ACCOUNTING DOCUMENTS V1

**Capability:** `AccountingDocumentsCapability`  
**Flags:** `ENABLE_ACCOUNTING_DOCUMENTS_V1` / `VITE_ENABLE_ACCOUNTING_DOCUMENTS_V1`  
**Verdict (closure pass):** `CARDBEY_ACCOUNTING_DOCUMENTS_V1_PARTIAL`

Blocking gate for READY: **staging Prisma migrate deploy + live E2E on staging** (this agent cannot apply production/staging DB from the worktree; migration SQL is landed in-repo).

---

## Architecture

```
User → Performer → AccountingDocumentsCapability
                 → Quote/Invoice draft → Review → Confirm → Issue / PDF / Send
```

Visitor **QuoteRequest** remains CRM enquiry — never merged into AccountingDocument.

---

## Migration

Canonical additive migrations:

- `apps/core/cardbey-core/prisma/postgres/migrations/20260825050000_accounting_documents_v1/migration.sql`
- `apps/core/cardbey-core/prisma/sqlite/migrations/20260825050000_accounting_documents_v1/migration.sql`

Tables: `BusinessBillingProfile`, `AccountingDocumentSequence`, `AccountingDocument`, `AccountingDocumentLine`, `AccountingDocumentShare`.

Rollback (documented in SQL header): drop share → line → document → sequence → billing profile.

**Staging:** apply via `prisma migrate deploy` on Core staging after merge. Then `prisma generate` and health check.

---

## PDF

- Renderer: `renderPdf.js` (pdfkit A4), from **`issuedSnapshot` only**
- Owner: `GET /api/stores/:storeId/accounting/documents/:id/pdf`
- Recipient: `GET /api/public/accounting-documents/:token/pdf`
- Integrity: re-render same snapshot → identical PDF; changed snapshot → different PDF (unit smoke)

---

## Recipient page

- Dashboard route: `/d/:token`
- API: `/api/public/accounting-documents/:token` (+ accept / decline / pdf)
- Token: opaque ≥20 chars; revoked/expired → safe 404/410; no sequential ID auth
- Quote: Accept / Decline / Download PDF
- Invoice: payment details from snapshot + Download PDF

---

## Accept / decline policy

- Idempotent accept/decline
- Expired `expiryDate` → status EXPIRED, cannot accept
- CANCELLED / CONVERTED / DECLINED cannot accept
- No auto-invoice on accept

---

## UI

Business Builder → Quotes & Invoices: draft, confirm-issue, share link, PDF, mobile stacked cards.

---

## Gate checklist

| Gate | Status |
|------|--------|
| staging migration applied | **Pending operator** |
| Prisma generate + Core healthy on staging | Pending |
| Quote create/issue | Code ready |
| `/d/:token` recipient | Code ready |
| Accept/decline | Code ready |
| Quote → Invoice | Code ready |
| Invoice issue + bank on snapshot | Code ready |
| Real PDF download | Code ready |
| PDF immutable snapshot | Unit verified |
| Performer confirm gate | Code ready |
| Cross-business permissions | Owner checks in routes |
| Desktop/mobile QA on staging | Pending live |
| Staging E2E scenarios 1–8 | Pending live |

---

## Post-V1 (explicitly out)

Email automation, payment settlement, credit notes, PO, reminders, BAS, Xero/MYOB.
