/**
 * PIL triggers for Accounting Documents (overdue + month-end drafts).
 * Suggest only — never auto-execute. Caller must respect 24h dismiss cooldown.
 */

import { getAccountingDocumentSummary } from '../accountingDocuments/documentService.js';

/**
 * @param {string} storeId
 * @param {object} [context]
 * @returns {Promise<Array<object>>}
 */
export async function evaluateAccountingPilTriggers(storeId, context = {}) {
  const triggers = [];
  if (!storeId) return triggers;

  try {
    const summary = await getAccountingDocumentSummary(storeId, context.userId, 'this_month');

    if (summary.overdue.length > 0) {
      const mostOverdue = summary.overdue.reduce(
        (m, o) => (o.daysOverdue > m.daysOverdue ? o : m),
        summary.overdue[0],
      );
      triggers.push({
        id: 'overdue_invoice_nudge',
        priority: mostOverdue.daysOverdue > 30 ? 'high' : 'medium',
        headline: `${summary.overdue.length} overdue invoice${summary.overdue.length > 1 ? 's' : ''}`,
        body: `${mostOverdue.buyerName} owes AUD ${(
          (mostOverdue.amountCents ?? 0) / 100
        ).toFixed(2)} — ${mostOverdue.daysOverdue} days overdue.`,
        suggestedPrompt: 'Chase overdue invoices and draft follow-up emails',
        surface: 'orders_accounting',
        icon: 'alert',
        dismissible: true,
        storeId,
      });
    }

    const today = new Date();
    const daysUntilMonthEnd =
      new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();
    const draftCount = summary.byStatus?.DRAFT ?? 0;
    if (daysUntilMonthEnd <= 5 && draftCount > 0) {
      triggers.push({
        id: 'month_end_quotes_nudge',
        priority: 'medium',
        headline: `${draftCount} draft document${draftCount > 1 ? 's' : ''} — month ends in ${daysUntilMonthEnd} days`,
        body: 'Review Quotes & Invoices on Orders before month close.',
        suggestedPrompt: 'Do the end of month invoice close',
        surface: 'orders_accounting',
        icon: 'calendar',
        dismissible: true,
        storeId,
      });
    }
  } catch (err) {
    console.warn('[PIL:accounting] Trigger evaluation failed:', err?.message || err);
  }

  return triggers;
}
