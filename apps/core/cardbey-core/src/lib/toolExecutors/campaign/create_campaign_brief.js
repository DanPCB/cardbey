/**
 * create_campaign_brief — Build structured campaign intent (Phase 2: in-memory only).
 */

import { randomUUID } from 'node:crypto';
import { executeContentTool } from '../executeContentTool.js';

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeContentTool({
    toolName: 'create_campaign_brief',
    input,
    context,
    processor: (inp, ctx) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const objective = String(inp?.objective ?? '').trim() || 'promote my business';
      const brief = {
        id: randomUUID(),
        storeId,
        objective,
        targetAudience: String(inp?.targetAudience ?? 'local customers').trim() || 'local customers',
        offer: inp?.offer != null ? String(inp.offer).trim() || null : null,
        duration: String(inp?.duration ?? '7 days').trim() || '7 days',
        tone: String(inp?.tone ?? 'friendly').trim() || 'friendly',
        createdAt: new Date().toISOString(),
      };

      return { brief, objectiveLength: objective.length };
    },
    validateResult: (result) => {
      const objectiveLen = result?.objectiveLength ?? String(result?.brief?.objective ?? '').length;
      if (objectiveLen < 3) {
        return {
          blocked: true,
          reason: 'insufficient_content',
          message: 'Unable to generate campaign brief with available data',
        };
      }
      return null;
    },
    isEmpty: (result) => !result?.brief,
  });
}

export default execute;
