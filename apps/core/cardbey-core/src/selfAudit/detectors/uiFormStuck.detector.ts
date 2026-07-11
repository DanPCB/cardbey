/**
 * Detects when Performer UI shows static form instead of DeepSeek responses.
 */

import { BaseDetector, type AuditContext, type AuditIssue } from './base.detector.js';

const INTAKE_PATH =
  'apps/dashboard/cardbey-marketing-dashboard/src/app/console/performer/useIntakeV2.ts';

export class UIFormStuckDetector extends BaseDetector {
  readonly name = 'UI Form Stuck';
  readonly detectorKey = 'ui-form-stuck';

  async detect(context: AuditContext): Promise<AuditIssue[]> {
    if (!this.shouldRun(context)) return [];

    const issues: AuditIssue[] = [];
    const userMessage = String(context.uiState?.userMessage ?? '').trim();
    const isStaticForm = context.uiState?.isStaticForm === true;
    const hasResponse = context.uiState?.hasDeepSeekResponse === true;
    const formType = String(context.uiState?.formType ?? '');

    const frontendEvents = context.frontendEvents ?? [];
    const userMessages = frontendEvents.filter((e) => e.type === 'user_message');
    const formRenders = frontendEvents.filter(
      (e) =>
        e.type === 'form_render' &&
        ['create_store', 'store_creation_draft'].includes(String(e.payload?.formType ?? '')),
    );
    const deepSeekResponses = frontendEvents.filter((e) => e.type === 'deepseek_response');

    const hasDeepSeekLogs = context.logs.some(
      (log) =>
        log.includes('DeepSeek') ||
        log.includes('multiAgent') ||
        log.includes('multi_agent') ||
        log.includes('/performer/intake/v2'),
    );

    const multiStoreMessage =
      userMessage || String(userMessages[userMessages.length - 1]?.payload?.message ?? '');

    const isMultiStore =
      /set\s+up\s+\d+\s+stores/i.test(multiStoreMessage) ||
      /different\s+cit/i.test(multiStoreMessage);

    const telemetryStuck =
      userMessages.length > 0 &&
      formRenders.length > 0 &&
      deepSeekResponses.length === 0 &&
      hasDeepSeekLogs;

    const isStuck =
      (hasDeepSeekLogs && isStaticForm && !hasResponse && Boolean(userMessage)) ||
      telemetryStuck;

    if (isStuck) {
      issues.push(
        this.createIssue(
          'ui',
          'critical',
          'UI stuck showing static form',
          `Performer shows static form (${formType || 'store_creation_draft'}) instead of DeepSeek response. Message: "${multiStoreMessage.slice(0, 120)}"`,
          INTAKE_PATH,
          {
            userMessage: multiStoreMessage,
            formType: formType || 'store_creation_draft',
            expected: 'show_execution_plan | multi_agent_dispatched | proactive_plan | clarification',
            actual: 'static_form',
            hasDeepSeekLogs,
            isMultiStore,
            telemetry: {
              userMessages: userMessages.length,
              formRenders: formRenders.length,
              deepSeekResponses: deepSeekResponses.length,
            },
          },
          'Route DeepSeek intake actions before create_store / store_creation_draft form render in useIntakeV2.',
          true,
        ),
      );
    }

    this.logDetect(issues.length);
    return issues;
  }
}
