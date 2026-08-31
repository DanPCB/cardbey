/**
 * Performer tool executors — Accounting Documents V1.
 * Issue/send tools refuse unless confirmed: true (confirm-before-execute).
 */

import { Features } from '../../../config/features.js';
import {
  convertQuoteToInvoice,
  createDocumentDraft,
  createShareToken,
  getAccountingDocumentSummary,
  getDocument,
  issueDocument,
  listDocuments,
  updateDocumentDraft,
} from '../../accountingDocuments/documentService.js';
import { DOC_TYPE } from '../../accountingDocuments/constants.js';
import { toCents } from '../../accountingDocuments/money.js';
import { toAgentDocumentRow } from '../../accountingDocuments/accountingAgentService.js';
import { callAgentJson } from '../../orchestration/agents/liveAgentHelpers.js';
import { llmGateway } from '../../llm/llmGateway.ts';
import { withAgentRetry } from '../../orchestration/agentRetry.js';

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

/** Agent read — list quotes/invoices (alias: list_invoices). */
export async function executeListAccountingDocuments(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  const storeId = storeIdFrom(context, args);
  if (!storeId) return { ok: false, error: 'storeId_required' };
  try {
    const records = await listDocuments(storeId, context.userId, {
      type: args.type,
      status: args.status,
      period: args.period,
      daysOverdue: args.daysOverdue,
    });
    return {
      ok: true,
      type: 'invoice_list',
      count: records.length,
      records: records.map(toAgentDocumentRow),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function executeGetInvoiceSummary(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  const storeId = storeIdFrom(context, args);
  if (!storeId) return { ok: false, error: 'storeId_required' };
  const period = args.period || 'this_month';
  try {
    const summary = await getAccountingDocumentSummary(storeId, context.userId, period);
    const overdueAmountCents = summary.overdue.reduce((s, o) => s + (o.amountCents ?? 0), 0);
    return {
      ok: true,
      type: 'invoice_summary',
      period,
      total: summary.total,
      totalCents: summary.totalCents,
      currency: 'AUD',
      byStatus: summary.byStatus,
      byType: summary.byType,
      overdueCount: summary.overdue.length,
      overdueAmountCents,
      overdue: summary.overdue,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function executeFlagOverdueInvoices(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  const storeId = storeIdFrom(context, args);
  if (!storeId) return { ok: false, error: 'storeId_required' };
  const daysOverdue = args.daysOverdue != null ? Number(args.daysOverdue) : 1;
  try {
    const overdue = await listDocuments(storeId, context.userId, { daysOverdue });
    const now = new Date();
    return {
      ok: true,
      type: 'overdue_invoices',
      count: overdue.length,
      invoices: overdue.map((inv) => {
        const row = toAgentDocumentRow(inv);
        return {
          ...row,
          daysOverdue: inv.dueDate
            ? Math.floor((now - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24))
            : null,
        };
      }),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Draft-only chase email — never sends. Owner must confirm any outbound message separately.
 */
export async function executeDraftChaseEmail(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  const storeId = storeIdFrom(context, args);
  const documentId = String(args.invoiceId || args.documentId || '').trim();
  if (!storeId || !documentId) return { ok: false, error: 'storeId_and_invoiceId_required' };
  const tone = ['gentle', 'firm', 'urgent'].includes(args.tone) ? args.tone : 'firm';
  try {
    const invoice = await getDocument(storeId, documentId, context.userId);
    if (invoice.type !== DOC_TYPE.INVOICE) {
      return { ok: false, error: 'not_an_invoice' };
    }
    const now = new Date();
    const daysOverdue = invoice.dueDate
      ? Math.floor((now - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24))
      : 0;
    const buyer = invoice.buyerJson && typeof invoice.buyerJson === 'object' ? invoice.buyerJson : {};
    const buyerName = buyer.name || buyer.tradingName || 'Customer';
    const storeName = context?.storeKnowledge?.name ?? 'our business';
    const amount = ((invoice.balanceDueCents ?? invoice.totalCents ?? 0) / 100).toFixed(2);

    const toneGuide = {
      gentle: 'Friendly and understanding. Assume it slipped their mind.',
      firm: 'Professional and direct. Clear about the outstanding amount.',
      urgent: 'Serious tone. This requires immediate attention.',
    };

    const email =
      (await callAgentJson({
        system: 'Return ONLY valid JSON with keys subject, body, callToAction.',
        user: `Write a payment follow-up email draft (do not send).

From: ${storeName}
To: ${buyerName}
Amount: AUD ${amount}
Due: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-AU') : 'not specified'}
Days overdue: ${daysOverdue}
Document: ${invoice.documentNumber || invoice.id}
Tone: ${toneGuide[tone]}

Return JSON: { "subject": "...", "body": "...", "callToAction": "..." }`,
        purpose: 'accounting:draft_chase_email',
        agentName: 'draft_chase_email',
        missionId: context?.missionId,
        sseEmitter: context?.sseEmitter,
        maxTokens: 600,
      })) || {
        subject: `Payment reminder — ${invoice.documentNumber || 'invoice'} for ${buyerName}`,
        body: `Hi ${buyerName},\n\nOur records show AUD ${amount} remains outstanding${daysOverdue > 0 ? ` (${daysOverdue} days overdue)` : ''}.\n\nPlease arrange payment at your earliest convenience.\n\nThank you,\n${storeName}`,
        callToAction: 'Please arrange payment at your earliest convenience.',
      };

    return {
      ok: true,
      type: 'chase_email_draft',
      invoiceId: documentId,
      buyerName,
      amountCents: invoice.balanceDueCents ?? invoice.totalCents ?? 0,
      daysOverdue,
      tone,
      email,
      message: 'Chase email drafted only — not sent. Confirm before any customer message.',
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function executeGenerateInvoiceReport(args = {}, context = {}) {
  const disabled = requireFlag();
  if (disabled) return disabled;
  const storeId = storeIdFrom(context, args);
  if (!storeId) return { ok: false, error: 'storeId_required' };
  const period = args.period === 'last_month' ? 'last_month' : 'this_month';
  try {
    const summary = await getAccountingDocumentSummary(storeId, context.userId, period);
    const storeName = context?.storeKnowledge?.name ?? 'your business';
    const overdueAmt = (
      summary.overdue.reduce((s, o) => s + (o.amountCents ?? 0), 0) / 100
    ).toFixed(2);
    const prompt = `Write a concise business report for ${storeName} based on this invoice data.

Period: ${period.replace('_', ' ')}
Total documents: ${summary.total}
Total amount: AUD ${(summary.totalCents / 100).toFixed(2)}
By status: ${JSON.stringify(summary.byStatus)}
By type: ${JSON.stringify(summary.byType)}
Overdue: ${summary.overdue.length} totalling AUD ${overdueAmt}
${
  summary.overdue.length
    ? 'Overdue: ' +
      summary.overdue
        .map((o) => `${o.buyerName} (AUD ${(o.amountCents / 100).toFixed(2)}, ${o.daysOverdue}d)`)
        .join(', ')
    : ''
}

Write 3-4 short markdown paragraphs: executive summary, outstanding actions, recommendation.
Return plain markdown only.`;

    const out = await withAgentRetry(
      () =>
        llmGateway.generate({
          purpose: 'accounting:invoice_report',
          prompt,
          provider: 'anthropic',
          tenantKey: context?.tenantKey || 'default',
          maxTokens: 800,
          temperature: 0.2,
        }),
      { agentName: 'generate_invoice_report', missionId: context?.missionId, sseEmitter: context?.sseEmitter },
    );

    return {
      ok: true,
      type: 'invoice_report',
      period,
      summary,
      report: String(out?.text ?? '').trim(),
      format: 'markdown',
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
