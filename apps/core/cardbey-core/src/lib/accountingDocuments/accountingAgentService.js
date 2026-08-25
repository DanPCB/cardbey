/**
 * DATA FLOW MAP — Invoice / Accounting Agent (Orders surface)
 *
 * Prisma: AccountingDocument (+ Line, Share, Sequence, BillingProfile)
 *   — NOT visitor QuoteRequest; NOT a fictional prisma.quote model.
 * Fields: type QUOTE|INVOICE, status (QUOTE_STATUS / INVOICE_STATUS),
 *   totalCents / balanceDueCents, dueDate, buyerJson, lines[], documentNumber.
 *
 * Data access: documentService.js (listDocuments, getAccountingDocumentSummary,
 *   createDocumentDraft, issueDocument, convertQuoteToInvoice, …).
 * Tools never call Prisma directly — always documentService.
 *
 * Tool executors: toolExecutors/accounting/* → toolRegistry + getExecutor.
 * Existing write spine: create_quote_draft (+ update/add/prepare/issue/send).
 * This layer adds READ + draft-only chase/report tools for agent patterns:
 *   Direct tool → Single-agent fast-path → Multi-agent (missionType multi_agent).
 *
 * Intake: performerIntakeV2 → resolveIntakeOrchestrationDispatch /
 *   accountingOrchestrationIntent → accountingDispatch OR AgentCoordinator.
 * Surface context: dashboard surfaceContext → intake currentContext
 *   (surface: 'orders_accounting' | 'invoices'). Ephemeral — not persisted.
 *
 * PIL: evaluateAccountingPilTriggers → seller opportunity / handoff
 *   (autoSubmit: false, 24h dismiss cooldown on client).
 *
 * UI home: Orders hub (/orders) embeds InvoicesPage; BB /business/... secondary.
 */

export {
  listDocuments,
  getDocument,
  getAccountingDocumentSummary,
  createDocumentDraft,
  convertQuoteToInvoice,
} from '../accountingDocuments/documentService.js';

export { DOC_TYPE, QUOTE_STATUS, INVOICE_STATUS } from '../accountingDocuments/constants.js';

/** Normalize a document row for agent tool payloads. */
export function toAgentDocumentRow(doc) {
  const buyer = doc?.buyerJson && typeof doc.buyerJson === 'object' ? doc.buyerJson : {};
  return {
    id: doc.id,
    type: doc.type,
    status: doc.status,
    documentNumber: doc.documentNumber ?? null,
    buyerName: buyer.name || buyer.tradingName || null,
    buyerEmail: buyer.email || null,
    totalCents: doc.totalCents ?? 0,
    balanceDueCents: doc.balanceDueCents ?? 0,
    currency: doc.currency || 'AUD',
    dueDate: doc.dueDate ?? null,
    issueDate: doc.issueDate ?? null,
    createdAt: doc.createdAt ?? null,
    updatedAt: doc.updatedAt ?? null,
  };
}
