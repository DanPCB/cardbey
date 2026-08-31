/**
 * Accounting Documents V1 — tool executor adapters (execute(context) shape).
 */

import {
  executeAddQuoteItem,
  executeCreateQuoteDraft,
  executeDraftChaseEmail,
  executeFlagOverdueInvoices,
  executeGenerateInvoiceReport,
  executeGetInvoiceSummary,
  executeIssueInvoice,
  executeIssueQuote,
  executeListAccountingDocuments,
  executePrepareInvoiceFromQuote,
  executePreviewCommercialDocument,
  executeSendDocument,
  executeUpdateQuoteDraft,
} from './accountingDocumentExecutors.js';

function wrap(fn) {
  return {
    async execute(context = {}) {
      const args = context.args || context.input || context;
      const result = await fn(args, {
        storeId: context.storeId || args.storeId,
        userId: context.userId || context.actorUserId,
        confirmed: context.confirmed === true || args.confirmed === true,
        missionId: context.missionId,
        sseEmitter: context.sseEmitter,
        storeKnowledge: context.storeKnowledge,
        tenantKey: context.tenantKey,
      });
      if (!result?.ok) {
        return {
          status: result?.error === 'confirmation_required' ? 'needs_confirmation' : 'error',
          reason: result?.error || 'failed',
          output: result,
        };
      }
      return { status: 'ok', output: result };
    },
  };
}

export const create_quote_draft = wrap(executeCreateQuoteDraft);
export const update_quote_draft = wrap(executeUpdateQuoteDraft);
export const add_quote_item = wrap(executeAddQuoteItem);
export const prepare_invoice_from_quote = wrap(executePrepareInvoiceFromQuote);
export const preview_commercial_document = wrap(executePreviewCommercialDocument);
export const issue_quote = wrap(executeIssueQuote);
export const issue_invoice = wrap(executeIssueInvoice);
export const send_document = wrap(executeSendDocument);

/** Agent read / draft tools (Orders + Performer binding). */
export const list_accounting_documents = wrap(executeListAccountingDocuments);
export const list_invoices = list_accounting_documents;
export const get_invoice_summary = wrap(executeGetInvoiceSummary);
export const flag_overdue_invoices = wrap(executeFlagOverdueInvoices);
export const draft_chase_email = wrap(executeDraftChaseEmail);
export const generate_invoice_report = wrap(executeGenerateInvoiceReport);
