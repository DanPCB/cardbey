# IMPACT REPORT — Accounting Documents V1

**Date:** 2026-08-25  
**Target verdict:** `CARDBEY_ACCOUNTING_DOCUMENTS_V1_READY`  
**Mode:** Audit complete → smallest commercial-document spine behind feature flag

---

## Audit summary (existing vs new)

| Concern | Existing | Decision |
|---------|----------|----------|
| Visitor quote enquiry | `QuoteRequest` + Growth panel | **Reuse as upstream CRM**; do not merge with issued Quote |
| Platform billing credits | `/api/billing` | **Do not reuse** |
| Creator payout bank | `CreatorPayoutAccount` | **Do not reuse** for store AR |
| Catalog / SKU | `Product` / `ProductVariant` | **Reuse** for line selection; **snapshot** on issue |
| POS customer | `CommerceCustomer` | **Optional FK**; document-local buyer allowed |
| Tax settings seed | `TaxProfile`, `CommerceBusinessSettings.taxInclusive` | **Seed** GST mode; new explicit GST model on docs |
| Payments | Stripe `Payment` + quote deposits | **Later** link via `linkedEntityType`; V1 = BANK_TRANSFER details only |
| PDF | Inbound parse / Puppeteer graphics | **New** document PDF renderer |
| Email | `sendMail` | **Reuse** when enabled; else download + share link |
| Audit | `BusinessEvent` + `AuditEvent` | **Reuse** event types |
| Performer | No accounting tools | **New** governed tools + confirm for issue/send |
| UI shell | `/business/invoices` EmptyState | **Extend** → Quotes & Invoices |
| ABN on Business | Missing on live `Business` | **New** `BusinessBillingProfile` |
| Money helpers | Float + ad-hoc `toCents` | **New** integer-cents calculator |

---

## What could break

1. **QuoteRequest confusion** — owner “Send quote” CRM reply mistaken for issued Quote → mitigate with distinct models + UI copy.
2. **Prisma Float money elsewhere** — new docs must not use Float for authoritative totals.
3. **Public API leaks** — bank settings / sequential IDs → owner-only settings; opaque share tokens.
4. **Silent issue/send** — Performer must draft only; issue/send confirmation required.
5. **Migration on postgres/sqlite dual schemas** — apply to both commerce schemas.

---

## Smallest safe patch (V1 spine)

1. Flag: `ENABLE_ACCOUNTING_DOCUMENTS_V1` (core) + `VITE_ENABLE_ACCOUNTING_DOCUMENTS_V1` (dashboard); non-prod default ON per conventions.
2. Models: `BusinessBillingProfile`, `AccountingDocument`, `AccountingDocumentLine`, `AccountingDocumentSequence`, `AccountingDocumentShare`.
3. Pure calc module (cents) + numbering service.
4. Owner APIs: CRUD draft, issue, accept, convert, mark paid, PDF, share.
5. Public: tokenized recipient view + accept/decline.
6. Dashboard: Quotes & Invoices list + create workspace (replace stub).
7. Performer tools: draft/update/add item/preview (auto); issue/send (confirm).
8. Do **not** change QuoteRequest behaviour globally.

---

## Out of scope (locked)

GL, payroll, BAS, bank feed, FX, payment processors, CREDIT_NOTE/PO/RECEIPT (schema-ready only).

---

**Verdict (implementation pass):** `CARDBEY_ACCOUNTING_DOCUMENTS_V1_PARTIAL`

Spine delivered behind `ENABLE_ACCOUNTING_DOCUMENTS_V1`. See `docs/ACCOUNTING_DOCUMENTS_V1.md` gate table for remaining READY items (PDF binary, `/d/:token` UI, migrate+live QA).
