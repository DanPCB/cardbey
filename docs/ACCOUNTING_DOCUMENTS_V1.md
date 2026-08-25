# ACCOUNTING DOCUMENTS V1

**Capability:** `AccountingDocumentsCapability`  
**Flags:** `ENABLE_ACCOUNTING_DOCUMENTS_V1` / `VITE_ENABLE_ACCOUNTING_DOCUMENTS_V1`  
**Verdict:** `CARDBEY_ACCOUNTING_DOCUMENTS_V1_READY`

**Commercial spine (frozen):**  
Customer/request → Quote → Accept → Invoice → Payment instructions/PDF

Staging proof (2026-08-25): migration live, quote create/issue, `/d/:token` recipient, real PDF, accept, quote→invoice, owner + public invoice PDFs — **16/16 E2E**.

Production: set `ENABLE_ACCOUNTING_DOCUMENTS_V1=true` on Core (non-prod defaults ON when unset). Dashboard twin follows non-prod default unless `VITE_ENABLE_ACCOUNTING_DOCUMENTS_V1` is set at build.

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

**Staging:** applied via Render preDeploy / `prisma-bootstrap` — verified by live health `features.accountingDocuments.v1` + E2E.

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
| staging migration applied | **PASS** |
| Prisma generate + Core healthy on staging | **PASS** |
| Quote create/issue | **PASS** (live E2E) |
| `/d/:token` recipient | **PASS** (live E2E) |
| Accept/decline | **PASS** (live E2E) |
| Quote → Invoice | **PASS** (live E2E) |
| Invoice issue + bank on snapshot | **PASS** (live E2E) |
| Real PDF download | **PASS** (live E2E) |
| PDF immutable snapshot | Unit verified |
| Performer confirm gate | Code ready |
| Cross-business permissions | Owner checks in routes |
| Desktop/mobile QA on staging | API + `/d/:token` verified |
| Staging E2E spine | **PASS** 16/16 |

---

## Scope freeze (V1)

**In:** Quote draft → issue → recipient accept/decline → convert → invoice issue → PDF / payment instructions on snapshot.

**Explicitly out of V1 (do not add in this phase):**

- General ledger / chart of accounts
- BAS / tax lodging
- Bank reconciliation
- Reminders / dunning
- Partial payments / payment plans
- Xero / MYOB (or other accounting sync)
- Payment settlement / card capture
- Email automation beyond share link
- Credit notes, purchase orders

Next phase starts only after an explicit scope reopen.
