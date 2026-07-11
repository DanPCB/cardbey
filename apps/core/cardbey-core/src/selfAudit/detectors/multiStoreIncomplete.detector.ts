/**
 * Detects incomplete multi-store field extraction in planner pipeline.
 */

import { BaseDetector, type AuditContext, type AuditIssue } from './base.detector.js';

const PLANNER_PATH = 'apps/core/cardbey-core/src/multiAgent/agents/planner.agent.ts';

export class MultiStoreIncompleteDetector extends BaseDetector {
  readonly name = 'Multi-Store Incomplete';
  readonly detectorKey = 'multi-store-incomplete';

  async detect(context: AuditContext): Promise<AuditIssue[]> {
    if (!this.shouldRun(context)) return [];

    const issues: AuditIssue[] = [];

    const multiStoreLogs = context.logs.filter(
      (log) =>
        (log.includes('Set up') || log.includes('setup') || log.includes('set up')) &&
        (log.includes('stores') || log.includes('branches') || log.includes('locations')) &&
        (log.includes('different cities') || log.includes('different cit')),
    );

    const incompleteResponses = context.logs.filter(
      (log) =>
        log.includes('Store names: Please provide') ||
        log.includes('Categories: Please specify') ||
        log.includes('missing fields') ||
        log.includes('needs_clarification') ||
        log.includes('missingFields'),
    );

    const intentPlans = context.telemetryBuffers?.intentPlans ?? [];
    const plannerFailures = (intentPlans as Array<{ ok?: boolean }>).filter((p) => p.ok === false);

    const frontendMultiStore = (context.frontendEvents ?? []).some((e) => {
      const msg = String(e.payload?.message ?? e.payload?.userMessage ?? '');
      return /set\s+up\s+\d+\s+stores/i.test(msg) || /different\s+cit/i.test(msg);
    });

    const hasSignal =
      (multiStoreLogs.length > 0 && incompleteResponses.length > 0) ||
      (frontendMultiStore && incompleteResponses.length > 0) ||
      (frontendMultiStore && plannerFailures.length > 0);

    if (hasSignal) {
      issues.push(
        this.createIssue(
          'agent',
          'high',
          'Multi-store planning missing fields',
          'Planner pipeline is not extracting store names, categories, and locations for multi-store requests.',
          PLANNER_PATH,
          {
            requests: multiStoreLogs.length,
            incompleteResponses: incompleteResponses.length,
            plannerFailures: plannerFailures.length,
            frontendMultiStore,
            sampleRequest: multiStoreLogs[0] ?? null,
          },
          'Ensure deepseekIntakeBridge returns generateMultiStoreClarificationResponse before static form fallback.',
          true,
        ),
      );
    }

    this.logDetect(issues.length);
    return issues;
  }
}
