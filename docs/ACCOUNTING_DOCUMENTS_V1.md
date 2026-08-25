# Accounting Documents V1

**Capability:** `AccountingDocumentsCapability` (Performer-orchestrated; not a second assistant)  
**Flag:** `ENABLE_ACCOUNTING_DOCUMENTS_V1` / `VITE_ENABLE_ACCOUNTING_DOCUMENTS_V1`  
**Positioning:** Commercial document creation + basic lifecycle — not a full accounting suite.

---

## Architecture

```
User → Performer → AccountingDocumentsCapability
                 → Quote/Invoice draft → Review → Confirm → Issue / PDF / Send
```

Confirm-before-execute for: `issue_quote`, `issue_invoice`, `send_document`.

### Distinction (locked)

| Concept | Model | Meaning |
|---------|-------|---------|
| Visitor enquiry | `QuoteRequest` | “I need a quote” → CRM |
| Issued Quote | `AccountingDocument` type `QUOTE` | Business commercial offer |
| Invoice | `AccountingDocument` type `INVOICE` | Tax Invoice when GST-registered |

Enquiry → Performer → Quote draft → Issue → Accept → Invoice is the intended spine.

---

## Data model

### BusinessBillingProfile (owner-only)

Legal + remittance: names, ABN/ACN, address, GST registered, bank (account name, BSB, account number), defaults (quote expiry days, payment terms days, GST mode, notes/terms).

### AccountingDocument

`type`: QUOTE | INVOICE (CREDIT_NOTE | PURCHASE_ORDER | RECEIPT reserved)  
`status`: see lifecycle  
`documentNumber` null until issue (or reserved on issue)  
`currency` default AUD  
`gstMode`: GST_EXCLUSIVE | GST_INCLUDED | GST_FREE  
Buyer JSON (document-local; optional `crmContactId` / `commerceCustomerId`)  
`sourceQuoteId` on invoices from conversion  
`issuedSnapshot` JSON — frozen at issue  
`quoteRequestId` optional link from CRM enquiry  

### AccountingDocumentLine

SKU (optional), name, description, qty (decimal as string/cents-scaled), unitPriceCents, gstCents, lineTotalCents, optional `productId`.

### AccountingDocumentSequence

Per `(storeId, type)` next integer — server-side only.

### AccountingDocumentShare

Opaque token, documentId, expiresAt, revokedAt.

---

## Money & GST

- All money in **integer cents**.
- GST rate default **1000 bps (10%)** when registered and not GST_FREE.
- LLM never authoritative for arithmetic.
- Rounding: half-up to nearest cent per line, then sum (documented in calc module).

### GST_EXCLUSIVE

`lineSubtotal = qty * unitPrice`  
`lineGst = round(lineSubtotal * rate)`  
`lineTotal = lineSubtotal + lineGst`  
Document: sum lines.

### GST_INCLUDED

`lineTotal = qty * unitPrice`  
`lineGst = round(lineTotal * rate / (10000 + rate))`  
`lineSubtotal = lineTotal - lineGst`

### GST_FREE / not registered

GST = 0; no “TAX INVOICE” label.

---

## Numbering

On **issue** only: `Q-000001` / `INV-000001` via atomic sequence. Drafts have no public number (or `DRAFT-*` internal id only).

---

## Lifecycles

**Quote:** DRAFT → ISSUED → ACCEPTED | DECLINED | CANCELLED; ACCEPTED → CONVERTED  
**Invoice:** DRAFT → ISSUED → PAID | OVERDUE | CANCELLED  

Issued docs: material edits create revision or are blocked; snapshot immutable.

---

## Security

- Bank settings: owner/admin only; never on public store projection.
- Recipient access: opaque share token only (no enumerable sequential public IDs).
- Cross-store denial on all owner APIs.

---

## PDF / share

HTML document template → PDF (Puppeteer or pdf library). Faithful to `issuedSnapshot`. Download + copy link; email when mailer available. Send requires confirmation.

---

## Performer tools

| Tool | Confirm |
|------|---------|
| create_quote_draft, update_quote_draft, add_quote_item, remove_quote_item | not required |
| prepare_invoice_from_quote, update_invoice_draft, preview_commercial_document | not required |
| issue_quote, issue_invoice, send_document | **required** |

Must not invent ABN, bank, prices, or addresses.

---

## UI

Business Builder → Quotes & Invoices (`/business/invoices` extended).  
Tabs: Quotes | Invoices. Create workspace: buyer, lines, totals, payment, notes, Save / Preview / Issue.

---

## Known limitations

- No GL, BAS, bank feed, FX, Stripe invoice settlement in V1.
- ABN format validate only (no ABR live verify on issue).
- PART_PAID / VIEWED / EXPIRED soft-supported in status enum; minimal automation.

---

## Acceptance gate (2026-08-25)

**Verdict: `CARDBEY_ACCOUNTING_DOCUMENTS_V1_PARTIAL`**

| Gate | Status |
|------|--------|
| business billing profile | Done (model + API) |
| buyer details | Done (document-local) |
| Quote draft | Done |
| line items | Done |
| deterministic GST | Done (cents + tests) |
| correct totals | Done |
| Quote issue + snapshot | Done |
| Quote acceptance | Done (owner + share token) |
| Quote → Invoice | Done |
| invoice due date | Done |
| bank payment details | Done (profile + invoice snapshot) |
| issued-document snapshot | Done |
| PDF/export | **Partial** — A4 HTML preview/print; dedicated PDF binary renderer TBD |
| secure recipient view | **Partial** — public token API + HTML; dashboard `/d/:token` page TBD |
| owner confirmation before issuing | Done (UI confirm + Performer `confirmed` gate) |
| Performer draft tools | Done (registry + executors; wiring to runner may need allowlist sync) |
| no invented prices | Done (`add_quote_item` refuses missing price) |
| permissions enforced | Done (store owner APIs) |
| desktop verified | Pending live QA |
| mobile verified | Pending (stacked create form present) |

### Remaining for READY

1. Prisma migrate + generate on staging
2. Wire accounting executors into tool runner allowlist / proactive runway sync
3. Dedicated PDF (HTML→PDF) download endpoint
4. Recipient React page at `/d/:token`
5. Live desktop/mobile verification screenshots
6. Email send via mailer when enabled
