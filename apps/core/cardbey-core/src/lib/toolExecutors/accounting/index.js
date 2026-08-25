/**
 * Accounting Documents V1 — tool executor adapters (execute(context) shape).
 */

import {
  executeAddQuoteItem,
  executeCreateQuoteDraft,
  executeIssueInvoice,
  executeIssueQuote,
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
