/**
 * Mission Pipeline tool: mcp_context_business
 * Read-only business / store context via MCP adapter registry (no UI, no new HTTP routes).
 */

import { executeMcpContextReadTool } from './executeMcpContextReadTool.js';

const ADAPTER_ID = 'mcp_context_business';

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeMcpContextReadTool({
    adapterId: ADAPTER_ID,
    contextType: 'business',
    input,
    context,
    buildInvokeArgs: (inp, ctx) => {
      const storeId = inp.storeId ?? ctx.storeId ?? null;
      return storeId != null && String(storeId).trim() ? { storeId: String(storeId).trim() } : {};
    },
  });
}
