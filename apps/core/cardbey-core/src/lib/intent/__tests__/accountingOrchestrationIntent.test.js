/**
 * Unit tests — accounting intent + tool mapping (no DB).
 */

import { describe, expect, it } from 'vitest';
import {
  isInvoiceIntent,
  isInvoiceMultiAgentIntent,
  resolveAccountingToolFromPrompt,
} from '../accountingOrchestrationIntent.js';

describe('accountingOrchestrationIntent', () => {
  describe('isInvoiceIntent', () => {
    it('matches invoice keywords', () => {
      expect(isInvoiceIntent('What are my outstanding invoices?')).toBe(true);
      expect(isInvoiceIntent('Chase the overdue payment on invoices')).toBe(true);
      expect(isInvoiceIntent('Show me my quotes')).toBe(true);
    });

    it('does not match unrelated prompts', () => {
      expect(isInvoiceIntent('Create a summer promotion graphic')).toBe(false);
      expect(isInvoiceIntent('What are my best selling products?')).toBe(false);
    });
  });

  describe('isInvoiceMultiAgentIntent', () => {
    it('matches complex invoice intents', () => {
      expect(isInvoiceMultiAgentIntent('Do the end of month close')).toBe(true);
      expect(isInvoiceMultiAgentIntent('Chase all overdue invoices')).toBe(true);
    });
    it('does not match simple invoice intents', () => {
      expect(isInvoiceMultiAgentIntent('Show me my invoices')).toBe(false);
    });
  });

  describe('resolveAccountingToolFromPrompt', () => {
    it('routes summary prompts', () => {
      expect(resolveAccountingToolFromPrompt("What's outstanding this month").toolName).toBe(
        'get_invoice_summary',
      );
    });
    it('routes overdue list', () => {
      expect(resolveAccountingToolFromPrompt('Who is overdue?').toolName).toBe(
        'flag_overdue_invoices',
      );
    });
  });
});
