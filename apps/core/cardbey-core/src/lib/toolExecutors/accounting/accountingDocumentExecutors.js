/**
 * Performer tool executors — Accounting Documents V1.
 * Issue/send tools refuse unless confirmed: true (confirm-before-execute).
 */

import { Features } from '../../../config/features.js';
import {
  convertQuoteToInvoice,
  createDocumentDraft,
  createShareToken,
  getDocument,
  issueDocument,
  updateDocumentDraft,
} from '../../accountingDocuments/documentService.js';
import { DOC_TYPE } from '../../accountingDocuments/constants.js';
import { toCents } from '../../accountingDocuments/money.js';

function requireFlag() {
  if (!Features.accountingDocuments?.v1) {
    return { ok: false, error: 'accounting_documents_disabled' };
  }
  return null;
}

function storeIdFrom(context, args) {
  return String(args?.storeId || context?.storeId || '').trim();
}

export async function executeCreateQuoteDraft(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  const storeId = storeIdFrom(context, args);
  if (!storeId) return { ok: false, error: 'storeId_required' };
  try {
    const document = await createDocumentDraft({
      storeId,
      actorUserId: context.userId,
      type: DOC_TYPE.QUOTE,
      buyer: args.buyer,
      lines: (args.lines || []).map((l) => ({
        ...l,
        unitPriceCents: l.unitPriceCents ?? (l.unitPrice != null ? toCents(l.unitPrice) : undefined),
      })),
      notes: args.notes,
      terms: args.terms,
      quoteRequestId: args.quoteRequestId,
      gstMode: args.gstMode,
    });
    return {
      ok: true,
      document,
      message:
        'Quote draft prepared. Review totals before issuing. I will not issue or send without your confirmation.',
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function executeUpdateQuoteDraft(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  const storeId = storeIdFrom(context, args);
  const documentId = String(args.documentId || '').trim();
  if (!storeId || !documentId) return { ok: false, error: 'storeId_and_documentId_required' };
  try {
    const document = await updateDocumentDraft(storeId, documentId, context.userId, args);
    return { ok: true, document };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function executeAddQuoteItem(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  const storeId = storeIdFrom(context, args);
  const documentId = String(args.documentId || '').trim();
  if (!storeId || !documentId) return { ok: false, error: 'storeId_and_documentId_required' };
  if (args.unitPrice == null && args.unitPriceCents == null) {
    return {
      ok: false,
      error: 'price_required',
      message: 'I need a unit price for this line — I will not invent one.',
    };
  }
  try {
    const existing = await getDocument(storeId, documentId, context.userId);
    const lines = [
      ...(existing.lines || []).map((l) => ({
        sku: l.sku,
        name: l.name,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        productId: l.productId,
      })),
      {
        sku: args.sku,
        name: args.name || args.item,
        description: args.description,
        quantity: args.quantity ?? 1,
        unitPriceCents: args.unitPriceCents ?? toCents(args.unitPrice),
        productId: args.productId,
      },
    ];
    const document = await updateDocumentDraft(storeId, documentId, context.userId, { lines });
    return { ok: true, document };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function executePrepareInvoiceFromQuote(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  const storeId = storeIdFrom(context, args);
  const quoteId = String(args.quoteId || args.documentId || '').trim();
  if (!storeId || !quoteId) return { ok: false, error: 'storeId_and_quoteId_required' };
  try {
    const document = await convertQuoteToInvoice(storeId, quoteId, context.userId);
    return {
      ok: true,
      document,
      message: 'Invoice draft created from accepted quote. Confirm before issuing.',
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function executeIssueQuote(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  if (args.confirmed !== true && context.confirmed !== true) {
    return {
      ok: false,
      error: 'confirmation_required',
      message: 'Confirm to issue this Quote. Issuing assigns a permanent number and snapshot.',
    };
  }
  const storeId = storeIdFrom(context, args);
  const documentId = String(args.documentId || '').trim();
  try {
    const document = await issueDocument(storeId, documentId, context.userId);
    return { ok: true, document };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function executeIssueInvoice(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  if (args.confirmed !== true && context.confirmed !== true) {
    return {
      ok: false,
      error: 'confirmation_required',
      message: 'Confirm to issue this Invoice. Issuing assigns a permanent number and snapshot.',
    };
  }
  const storeId = storeIdFrom(context, args);
  const documentId = String(args.documentId || '').trim();
  try {
    const document = await issueDocument(storeId, documentId, context.userId);
    return { ok: true, document };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function executeSendDocument(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  if (args.confirmed !== true && context.confirmed !== true) {
    return {
      ok: false,
      error: 'confirmation_required',
      message: 'Confirm to create a share link for this document.',
    };
  }
  const storeId = storeIdFrom(context, args);
  const documentId = String(args.documentId || '').trim();
  try {
    const share = await createShareToken(storeId, documentId, context.userId);
    return {
      ok: true,
      share: { token: share.token, path: `/d/${share.token}`, expiresAt: share.expiresAt },
      message: 'Share link created. Email delivery uses Cardbey mailer when enabled.',
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function executePreviewCommercialDocument(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  const storeId = storeIdFrom(context, args);
  const documentId = String(args.documentId || '').trim();
  try {
    const document = await getDocument(storeId, documentId, context.userId);
    return {
      ok: true,
      document,
      previewPath: `/api/stores/${storeId}/accounting/documents/${documentId}/preview.html`,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
