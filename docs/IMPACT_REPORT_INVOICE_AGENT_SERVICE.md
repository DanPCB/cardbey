# Impact Report — Invoice Agent Service (Orders-bound)

**Date:** 2026-08-25  
**Intent:** Bind Performer (direct tool → single agent → multi-agent) to Quotes/Invoices; keep UI on **Orders** hub.

## Map (do not invent)

| Question | Answer |
|----------|--------|
| Model | `AccountingDocument` (+ lines/shares/billing) — **not** `Quote` / visitor `QuoteRequest` |
| Money | `*Cents` fields; statuses `QUOTE_STATUS` / `INVOICE_STATUS` |
| Data API | `documentService.js` (`listDocuments`, `createDocumentDraft`, …) |
| Existing tools | `create_quote_draft`, `update_quote_draft`, `add_quote_item`, `prepare_invoice_from_quote`, `preview_commercial_document`, `issue_*`, `send_document` (confirm-gated) |
| Intake | `campaignOrchestrationIntent.js` + `unifiedDispatch` — **no** `intakeClassifier.js` |
| Surface | Dashboard `surfaceContext` → intake `currentContext`; Ask Performer via `launchPerformerEntrypoint` |
| UI home | **Orders** (`/orders`) embeds InvoicesPage; BB path remains secondary |

## What could break

1. **Duplicate data layer** — Prompt’s `prisma.quote` / `invoiceService.js` would diverge from Accounting Documents V1 and break money/status rules.
2. **Re-registering `create_quote_draft`** — Conflicts with existing confirm-gated issue/send tools.
3. **Intent false positives** — Broad `/payment|bill|revenue/` patterns can steal campaign/catalog turns.
4. **Auto-chase / auto-issue** — Violates safe-execution governance (confirm before customer messages / issue).
5. **Dirty canonical tree** — Current checkout is mid-feature (`fix/multi-agent-capability-e2e`); editing in place risks mixing unrelated diffs.

## Why

Accounting Documents V1 is already READY on staging/main. Agent work must **extend** that spine and bind the **Orders** surface, not recreate commercial docs.

## Impact scope

- Core: `accountingDocuments/*`, `toolExecutors/accounting/*`, `toolRegistry`, `intakeToolRegistry`, intent/orchestration intake, optional PIL helper
- Dashboard: Orders hub + InvoicesPage Performer handoff, quick prompts, result renderers, PIL opportunity (cooldown)
- Out of scope: ledger/BAS/Xero, payment settlement, OMS overhaul

## Smallest safe patch

1. Add **read** helpers on `documentService` (summary + overdue) — no new Prisma model.
2. Add tools: `list_accounting_documents`, `get_invoice_summary`, `flag_overdue_invoices`, `draft_chase_email` (draft only), `generate_invoice_report` — reuse existing `create_quote_draft`.
3. Add `accountingOrchestrationIntent.js` (narrow patterns) + wire into `resolveIntakeOrchestrationDispatch` / single-tool fast-path; pass `surface: 'orders_accounting'` in `currentContext`.
4. Orders hub: quick prompts + richer Ask Performer context; render summary/chase/report cards.
5. PIL: overdue nudge via opportunity generator + 24h dismiss cooldown; `autoSubmit: false`.

## Proceed

Implement adapted plan on an isolated worktree from `origin/staging` (canonical tree stays untouched).
