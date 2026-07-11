/**
 * Detects memory leaks via RSS growth and allocation warnings.
 */

import { BaseDetector, type AuditContext, type AuditIssue } from './base.detector.js';

const MEMORY_THRESHOLD_MB = 3000;
const ALLOCATION_THRESHOLD = 0.9;

export class MemoryLeakDetector extends BaseDetector {
  readonly name = 'Memory Leak';
  readonly detectorKey = 'memory-leak';

  async detect(context: AuditContext): Promise<AuditIssue[]> {
    if (!this.shouldRun(context)) return [];

    const issues: AuditIssue[] = [];

    const memoryUsage = Number(
      context.metrics?.memory_usage ?? context.metrics?.rss ?? 0,
    );
    const allocationUsage = Number(context.metrics?.allocation_usage ?? 0);

    const memoryWarnings = context.logs.filter(
      (log) =>
        log.includes('WARNING: RSS growth') ||
        (log.includes('memory') && log.includes('critical')) ||
        log.includes('allocation usage'),
    );

    const overThreshold =
      memoryUsage > MEMORY_THRESHOLD_MB ||
      allocationUsage > ALLOCATION_THRESHOLD ||
      memoryWarnings.length > 0;

    if (overThreshold) {
      issues.push(
        this.createIssue(
          'performance',
          'critical',
          `Memory leak detected (${memoryUsage}MB)`,
          `Memory usage at ${memoryUsage}MB with ${memoryWarnings.length} memory warnings.`,
          'apps/core/cardbey-core/src/multiAgent/monitoring/monitoringRuntimeBridge.ts',
          {
            memoryUsage,
            allocationUsage,
            memoryWarnings: memoryWarnings.length,
            sampleWarnings: memoryWarnings.slice(0, 3),
          },
          'Trim telemetry ring buffers, enforce retention, and monitor RSS via notifyProcessMemory.',
          true,
        ),
      );
    }

    this.logDetect(issues.length);
    return issues;
  }
}
