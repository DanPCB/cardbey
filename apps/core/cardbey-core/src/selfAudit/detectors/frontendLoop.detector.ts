/**
 * Detects infinite frontend request loops.
 */

import { BaseDetector, type AuditContext, type AuditIssue } from './base.detector.js';

const HOOK_PATH =
  'apps/dashboard/cardbey-marketing-dashboard/src/app/console/performer/useIntakeV2.ts';

export class FrontendLoopDetector extends BaseDetector {
  readonly name = 'Frontend Loop';
  readonly detectorKey = 'frontend-loop';

  async detect(context: AuditContext): Promise<AuditIssue[]> {
    if (!this.shouldRun(context)) return [];

    const issues: AuditIssue[] = [];

    const repeatedCalls = context.logs.filter(
      (log) =>
        log.includes('/agent-messages/stream-token') ||
        log.includes('/performer/intake/v2') ||
        log.includes('Maximum update depth exceeded'),
    );

    const streamEvents = (context.frontendEvents ?? []).filter(
      (e) => e.type === 'stream_token' || e.type === 'intake_action',
    );

    const loopErrors = context.logs.filter(
      (log) =>
        log.includes('Maximum update depth exceeded') ||
        log.includes('infinite loop') ||
        log.includes('setState inside useEffect'),
    );

    const callCount = Math.max(repeatedCalls.length, streamEvents.length);

    if (callCount > 100 || loopErrors.length > 5) {
      issues.push(
        this.createIssue(
          'ui',
          'critical',
          'Frontend infinite request loop detected',
          `Detected ${callCount} repeated API calls. ${loopErrors.length > 0 ? `${loopErrors.length} React loop errors.` : ''}`,
          HOOK_PATH,
          {
            totalCalls: callCount,
            loopErrors: loopErrors.length,
            sampleCalls: repeatedCalls.slice(0, 5),
            streamEvents: streamEvents.length,
          },
          'Add request deduplication, render guards, and debouncing in useIntakeV2.',
          true,
        ),
      );
    }

    this.logDetect(issues.length);
    return issues;
  }
}
