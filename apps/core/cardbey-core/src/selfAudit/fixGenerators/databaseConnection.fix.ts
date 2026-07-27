/**
 * Fix proposal for database connection issues.
 */

import type { AuditIssue } from '../detectors/base.detector.js';
import { BaseFixGenerator, PATH_A_GUARDRAILS, type FixPlan } from './base.fix.js';

export class DatabaseConnectionFix extends BaseFixGenerator {
  canFix(issue: AuditIssue): boolean {
    return issue.category === 'database' && issue.id.includes('db-connection');
  }

  generate(issue: AuditIssue): FixPlan {
    return {
      issueId: issue.id,
      description:
        'Enhance withPrismaConnection retry, connection health checks, and pool tuning via env PRISMA_CONNECTION_LIMIT.',
      guardrails: { ...PATH_A_GUARDRAILS },
      status: 'proposed',
      files: [
        {
          path: 'apps/core/cardbey-core/src/lib/prisma.js',
          content: '',
          patch: `@@ withPrismaConnection
+ // Add exponential backoff on reconnect (max 3 retries)
+ // Call ensurePrismaConnection at server startup via initializeDatabase()`,
        },
      ],
      tests: [
        'Connection recovery after "Connection has not been opened"',
        'withPrismaConnection retries once on closed connection',
      ],
    };
  }
}
