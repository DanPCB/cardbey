/**
 * Mission Pipeline tool: mcp_context_missions
 * Read-only MissionPipeline history via MCP adapter.
 */

import { executeMcpContextReadTool } from './executeMcpContextReadTool.js';

const ADAPTER_ID = 'mcp_context_missions';

/**
 * @param {object} [input]
 * @param {number} [input.limit]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeMcpContextReadTool({
    adapterId: ADAPTER_ID,
    contextType: 'missions',
    input,
    context,
    useStoreTenantKey: true,
    buildInvokeArgs: (inp, ctx) => {
      const storeId = inp.storeId ?? ctx.storeId ?? null;
      return {
        limit: inp.limit,
        ...(storeId != null && String(storeId).trim() ? { storeId: String(storeId).trim() } : {}),
      };
    },
  });
}
