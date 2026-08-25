/**
 * Accounting / invoice intent — Orders Quotes & Invoices surface.
 * Narrow patterns to avoid stealing campaign/catalog turns.
 */

/** Single-agent / direct-tool invoice domain. */
const INVOICE_PATTERNS = [
  /\binvoices?\b/i,
  /\bquotes?\b/i,
  /\boverdue\b/i,
  /\boutstanding\b/i,
  /\breceivable\b/i,
  /\bmonth[-\s]?end\b/i,
  /\bmonth[-\s]?close\b/i,
  /\bchase\b.*\b(invoice|overdue|payment|client|customer)\b/i,
  /\b(invoice|overdue|payment).*\bchase\b/i,
  /\bfollow[-\s]?up\b.*\b(client|customer|invoice|payment)\b/i,
  /\b(client|customer|invoice).*\bfollow[-\s]?up\b/i,
  /\bdraft\s+(a\s+)?(chase|reminder)\b/i,
  /\bwhat('?s| is)\s+outstanding\b/i,
];

/** Multi-agent missions (month-end, chase all, full report). */
const INVOICE_MULTI_PATTERNS = [
  /\bmonth[-\s]?end\b/i,
  /\bend\s+of\s+(the\s+)?month\b/i,
  /\bclose\s+the\s+books\b/i,
  /\bchase\s+all\b/i,
  /\ball\s+overdue\b/i,
  /\bfull\s+(invoice\s+)?report\b/i,
  /\binvoice\s+close\b/i,
];

/** @param {string | null | undefined} prompt */
export function isInvoiceIntent(prompt) {
  const text = String(prompt ?? '').trim();
  if (!text) return false;
  return INVOICE_PATTERNS.some((p) => p.test(text));
}

/** @param {string | null | undefined} prompt */
export function isInvoiceMultiAgentIntent(prompt) {
  const text = String(prompt ?? '').trim();
  if (!text) return false;
  return INVOICE_MULTI_PATTERNS.some((p) => p.test(text));
}

/**
 * Map NL to a single accounting tool + args (storeId filled by caller).
 * @param {string} prompt
 * @returns {{ toolName: string, args: Record<string, unknown> }}
 */
export function resolveAccountingToolFromPrompt(prompt) {
  const p = String(prompt ?? '');

  if (/summary|overview|how many|what.*outstanding|overdue.*total|what'?s outstanding/i.test(p)) {
    return {
      toolName: 'get_invoice_summary',
      args: { period: /last month/i.test(p) ? 'last_month' : 'this_month' },
    };
  }

  if (/chase|follow.?up|remind/i.test(p)) {
    return {
      toolName: 'draft_chase_email',
      args: {
        daysOverdue: 1,
        tone: /urgent/i.test(p) ? 'urgent' : /gentle/i.test(p) ? 'gentle' : 'firm',
        _resolveMostOverdue: true,
      },
    };
  }

  if (/overdue|who.*owe|not paid/i.test(p)) {
    return { toolName: 'flag_overdue_invoices', args: { daysOverdue: 1 } };
  }

  if (/report|revenue/i.test(p)) {
    return {
      toolName: 'generate_invoice_report',
      args: { period: /last month/i.test(p) ? 'last_month' : 'this_month' },
    };
  }

  if (/create|write|draft/i.test(p) && /quote/i.test(p)) {
    return { toolName: 'create_quote_draft', args: {} };
  }

  return { toolName: 'list_accounting_documents', args: {} };
}
