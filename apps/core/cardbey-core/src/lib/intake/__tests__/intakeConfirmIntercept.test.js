import { describe, expect, it } from 'vitest';
import {
  conversationAwaitingIntakeConfirm,
  isIntakeConfirmAffirmation,
  sessionHasPendingIntakePlanConfirm,
  normalizeConfirmInterceptClassification,
  formatIntakeValidationClarifyMessage,
} from '../intakeConfirmIntercept.js';

describe('intakeConfirmIntercept', () => {
  it('recognizes confirm affirmations', () => {
    expect(isIntakeConfirmAffirmation('confirm')).toBe(true);
    expect(isIntakeConfirmAffirmation('  OK  ')).toBe(true);
    expect(isIntakeConfirmAffirmation('create campaign')).toBe(false);
  });

  it('detects pending confirm from conversation history without persisted intent', () => {
    const history = [
      { role: 'user', content: 'Create a promotion campaign for my store' },
      { role: 'assistant', content: 'Please confirm before proceeding: create_campaign' },
      { role: 'user', content: 'confirm' },
    ];

    expect(conversationAwaitingIntakeConfirm(history)).toBe(true);
    expect(sessionHasPendingIntakePlanConfirm(null, null, history)).toBe(true);
  });

  it('does not treat unrelated history as pending confirm', () => {
    const history = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'How can I help?' },
    ];

    expect(conversationAwaitingIntakeConfirm(history)).toBe(false);
    expect(sessionHasPendingIntakePlanConfirm(null, null, history)).toBe(false);
  });

  it('detects pending confirm from server-side pending store without client history', () => {
    expect(
      sessionHasPendingIntakePlanConfirm(null, null, [], { tool: 'create_campaign' }),
    ).toBe(true);
  });

  it('formats named validation clarify messages', () => {
    expect(
      formatIntakeValidationClarifyMessage([{ field: 'storeId', reason: 'requires_store' }]),
    ).toBe('I need a store to run that safely.');
  });

  it('does not ask for unknown_field transport metadata as required slots', () => {
    expect(
      formatIntakeValidationClarifyMessage([
        { field: 'sourceType', reason: 'unknown_field' },
        { field: 'clientRequestId', reason: 'unknown_field' },
      ]),
    ).toMatch(/more detail/i);
    expect(
      formatIntakeValidationClarifyMessage([
        { field: 'sourceType', reason: 'unknown_field' },
        { field: 'clientRequestId', reason: 'unknown_field' },
      ]),
    ).not.toMatch(/source type|client request id/i);
  });

  it('normalizes confirm intercept executionPath from tool registry', () => {
    const normalized = normalizeConfirmInterceptClassification({
      tool: 'create_campaign',
      executionPath: 'proactive_plan',
      _confirmIntercept: true,
    });
    expect(normalized?.executionPath).toBe('kernel_dispatch');
  });
});
