/**
 * Mission Pipeline tool: mcp_context_promotions
 * Read-only promotion context via MCP adapter (Mission Execution → dispatchTool → executor → adapter).
 */

import { executeMcpContextReadTool } from './executeMcpContextReadTool.js';

const ADAPTER_ID = 'mcp_context_promotions';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeMcpContextReadTool({
    adapterId: ADAPTER_ID,
    contextType: 'promotions',
    input,
    context,
    useStoreTenantKey: true,
    buildInvokeArgs: (inp, ctx) => {
      const storeId = inp.storeId ?? ctx.storeId ?? null;
      return storeId != null && String(storeId).trim() ? { storeId: String(storeId).trim() } : {};
    },
  });
}
