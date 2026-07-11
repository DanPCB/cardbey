/**
 * Fix proposal for memory leaks.
 */

import type { AuditIssue } from '../detectors/base.detector.js';
import { BaseFixGenerator, PATH_A_GUARDRAILS, type FixPlan } from './base.fix.js';

export class MemoryLeakFix extends BaseFixGenerator {
  canFix(issue: AuditIssue): boolean {
    return issue.category === 'performance' && issue.id.includes('memory-leak');
  }

  generate(issue: AuditIssue): FixPlan {
    return {
      issueId: issue.id,
      description:
        'Trim missionConsoleTelemetryStore ring buffers, enforce SELF_AUDIT_RETENTION_DAYS, monitor RSS via notifyProcessMemory.',
      guardrails: { ...PATH_A_GUARDRAILS },
      status: 'proposed',
      files: [
        {
          path: 'apps/core/cardbey-core/src/lib/orchestrator/missionConsoleTelemetryStore.js',
          content: '',
          patch: 'Review MAX_PIPELINE / MAX_INTENT limits; add periodic trim.',
        },
        {
          path: 'apps/core/cardbey-core/src/multiAgent/monitoring/monitoringRuntimeBridge.ts',
          content: '',
          patch: 'Ensure notifyProcessMemory triggers alert evaluation on RSS threshold.',
        },
      ],
      tests: ['RSS stable over 1h under normal load', 'Telemetry buffers bounded'],
    };
  }
}
