/**
 * Detects campaign/loyalty requests incorrectly routed to HITL.
 */

import { BaseDetector, type AuditContext, type AuditIssue } from './base.detector.js';

const BRIDGE_PATH = 'apps/core/cardbey-core/src/lib/multiAgent/deepseekIntakeBridge.ts';

export class HITLRoutingDetector extends BaseDetector {
  readonly name = 'HITL Routing';
  readonly detectorKey = 'hitl-routing';

  async detect(context: AuditContext): Promise<AuditIssue[]> {
    if (!this.shouldRun(context)) return [];

    const issues: AuditIssue[] = [];

    const campaignRequests = context.logs.filter((log) => {
      const lower = log.toLowerCase();
      return (
        lower.includes('loyalty') ||
        lower.includes('campaign') ||
        lower.includes('create a loyalty')
      );
    });

    const hitlResponses = context.logs.filter(
      (log) =>
        log.includes('approval_required') ||
        log.includes('pending_human_review') ||
        log.includes('HITL'),
    );

    const frontendHitl = (context.frontendEvents ?? []).some(
      (e) =>
        e.type === 'deepseek_response' &&
        ['approval_required', 'pending_human_review'].includes(
          String(e.payload?.action ?? ''),
        ),
    );

    if ((campaignRequests.length > 0 && hitlResponses.length > 0) || frontendHitl) {
      issues.push(
        this.createIssue(
          'routing',
          'high',
          'HITL triggered for campaign requests',
          `${campaignRequests.length} campaign/loyalty requests were routed to HITL instead of compiler spine.`,
          BRIDGE_PATH,
          {
            campaignRequests: campaignRequests.length,
            hitlResponses: hitlResponses.length,
            frontendHitl,
            sampleRequest: campaignRequests[0] ?? null,
          },
          'Add isCompilerSpineIntake() early return before DeepSeek HITL gate for campaign/loyalty intents.',
          true,
        ),
      );
    }

    this.logDetect(issues.length);
    return issues;
  }
}
