/**
 * Single-agent / direct-tool dispatch for Accounting Documents on Orders surface.
 */

import { getExecutor } from '../toolExecutors/index.js';
import {
  isInvoiceIntent,
  isInvoiceMultiAgentIntent,
  resolveAccountingToolFromPrompt,
} from '../intent/accountingOrchestrationIntent.js';
import { executeFlagOverdueInvoices, executeDraftChaseEmail } from '../toolExecutors/accounting/accountingDocumentExecutors.js';

export { isInvoiceIntent, isInvoiceMultiAgentIntent, resolveAccountingToolFromPrompt };

/**
 * @param {object} brief
 * @returns {Promise<{ type: string, tool: string, result: object }>}
 */
export async function dispatchSingleAgentInvoice(brief = {}) {
  const { prompt, storeId, userId, surfaceContext, missionId, sseEmitter, storeKnowledge } = brief;
  if (!storeId) {
    return {
      type: 'tool_result',
      tool: 'get_invoice_summary',
      result: { ok: false, error: 'storeId_required' },
    };
  }

  const resolved = resolveAccountingToolFromPrompt(prompt);
  const context = {
    storeId,
    userId,
    missionId,
    sseEmitter,
    storeKnowledge,
    surfaceContext: surfaceContext || null,
  };

  // Chase: resolve most overdue invoice first (draft only — never sends).
  if (resolved.toolName === 'draft_chase_email' && resolved.args?._resolveMostOverdue) {
    const overdue = await executeFlagOverdueInvoices(
      { storeId, daysOverdue: resolved.args.daysOverdue || 1 },
      context,
    );
    const first = overdue?.invoices?.[0];
    if (!first?.id) {
      return {
        type: 'tool_result',
        tool: 'flag_overdue_invoices',
        result: overdue?.ok
          ? { ...overdue, message: 'No overdue invoices to chase.' }
          : overdue,
      };
    }
    const email = await executeDraftChaseEmail(
      { storeId, invoiceId: first.id, tone: resolved.args.tone },
      context,
    );
    return { type: 'tool_result', tool: 'draft_chase_email', result: email };
  }

  const executor = getExecutor(resolved.toolName);
  if (!executor?.execute) {
    return {
      type: 'tool_result',
      tool: resolved.toolName,
      result: { ok: false, error: 'executor_missing' },
    };
  }

  const args = { ...resolved.args, storeId };
  delete args._resolveMostOverdue;
  const wrapped = await executor.execute({ ...context, args, input: args });
  const result = wrapped?.output ?? wrapped;
  return { type: 'tool_result', tool: resolved.toolName, result };
}
