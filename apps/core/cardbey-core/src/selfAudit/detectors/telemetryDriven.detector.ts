/**
 * Converts Mission Console telemetry issues into AuditIssue format.
 */

import { BaseDetector, type AuditContext, type AuditIssue } from './base.detector.js';
import { deriveTelemetryAuditIssues } from '../integration/telemetryBridge.js';

export class TelemetryDrivenDetector extends BaseDetector {
  readonly name = 'Telemetry Driven';
  readonly detectorKey = 'telemetry-driven';

  async detect(context: AuditContext): Promise<AuditIssue[]> {
    if (!this.shouldRun(context)) return [];

    try {
      const issues = deriveTelemetryAuditIssues(context);
      this.logDetect(issues.length, { source: 'telemetry_bridge' });
      return issues;
    } catch (err) {
      this.logDetect(0, { error: (err as Error).message });
      return [];
    }
  }
}
