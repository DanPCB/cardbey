/**
 * Detects Prisma connection pool exhaustion and connection errors.
 */

import { BaseDetector, type AuditContext, type AuditIssue } from './base.detector.js';

const PRISMA_PATH = 'apps/core/cardbey-core/src/lib/prisma.js';

export class DatabaseConnectionDetector extends BaseDetector {
  readonly name = 'Database Connection';
  readonly detectorKey = 'db-connection';

  async detect(context: AuditContext): Promise<AuditIssue[]> {
    if (!this.shouldRun(context)) return [];

    const issues: AuditIssue[] = [];

    const connectionErrors = context.errors.filter(
      (e) =>
        String(e.message ?? '').includes('Connection has not been opened') ||
        e.code === 'P2024' ||
        (String(e.message ?? '').includes('Prisma') &&
          String(e.message ?? '').includes('connection')),
    );

    const logErrors = context.logs.filter(
      (log) =>
        log.includes('prisma:error') ||
        log.includes('Connection has not been opened') ||
        log.includes('[Prisma] connection error'),
    );

    const totalErrors = connectionErrors.length + logErrors.length;

    if (totalErrors > 5) {
      issues.push(
        this.createIssue(
          'database',
          totalErrors > 20 ? 'critical' : 'high',
          'Database connection pool exhaustion',
          `Prisma connection errors detected (${totalErrors} occurrences).`,
          PRISMA_PATH,
          {
            connectionErrors: connectionErrors.length,
            logErrors: logErrors.length,
            totalErrors,
          },
          'Tune withPrismaConnection retry, pool limits, and connection health probes.',
          true,
        ),
      );
    }

    this.logDetect(issues.length);
    return issues;
  }
}
