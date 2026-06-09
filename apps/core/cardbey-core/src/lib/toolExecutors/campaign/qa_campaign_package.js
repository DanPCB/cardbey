/**
 * qa_campaign_package — Validate campaign brief, graphics, and copy completeness.
 */

import { executeContentTool } from '../executeContentTool.js';

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  return await executeContentTool({
    toolName: 'qa_campaign_package',
    input,
    context: {},
    processor: (inp) => {
      const brief = inp?.brief && typeof inp.brief === 'object' ? inp.brief : {};
      const graphics = Array.isArray(inp?.graphics) ? inp.graphics : [];
      const copy = inp?.copy && typeof inp.copy === 'object' ? inp.copy : {};

      /** @type {string[]} */
      const issues = [];

      if (!String(brief?.objective ?? '').trim()) {
        issues.push('brief.objective is empty');
      }
      if (graphics.length < 1) {
        issues.push('graphics has no results');
      }
      if (!String(copy?.headline ?? '').trim()) {
        issues.push('copy.headline is empty');
      }
      if (!String(copy?.cta ?? '').trim()) {
        issues.push('copy.cta is empty');
      }

      return { passed: issues.length === 0, issues };
    },
    validateResult: (result) => {
      if (!result?.passed) {
        return {
          blocked: true,
          reason: 'qa_failed',
          message: `Campaign QA failed: ${(result?.issues ?? []).join('; ') || 'unknown issues'}`,
        };
      }
      return null;
    },
    isEmpty: () => false,
    countRecords: (result) => (result?.passed ? 1 : 0),
  });
}

export default execute;
