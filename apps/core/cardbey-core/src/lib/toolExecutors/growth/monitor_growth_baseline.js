/**
 * monitor_growth_baseline — Record growth audit baseline for future comparison.
 */

import { randomUUID } from 'node:crypto';
import { executeAnalysisTool } from '../executeAnalysisTool.js';

const AUDIT_INTERVAL_DAYS = 30;

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeAnalysisTool({
    toolName: 'monitor_growth_baseline',
    input,
    context,
    analyzer: (inp, ctx) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const audit = inp?.audit && typeof inp.audit === 'object' ? inp.audit : {};
      const planId =
        typeof inp?.planId === 'string' && inp.planId.trim() ? inp.planId.trim() : null;
      const actionTaken =
        typeof inp?.actionTaken === 'string' && inp.actionTaken.trim()
          ? inp.actionTaken.trim()
          : null;

      const nextAuditAt = new Date(
        Date.now() + AUDIT_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      return {
        baseline: {
          trackingId: randomUUID(),
          storeId,
          recordedAt: new Date().toISOString(),
          scores: audit.scores ?? {},
          overallScore: audit.overallScore ?? 0,
          planId,
          actionTaken,
          nextAuditAt,
          persisted: false,
        },
      };
    },
    isEmpty: (result) => Object.keys(result?.baseline?.scores ?? {}).length === 0 && !result?.baseline?.overallScore,
    validateOutput: (result) => {
      if (!result?.baseline?.persisted) {
        return {
          blocked: true,
          reason: 'not_persisted',
          message: 'Growth baseline recorded in memory only — persistence not wired yet',
        };
      }
      return null;
    },
  });
}

export default execute;
