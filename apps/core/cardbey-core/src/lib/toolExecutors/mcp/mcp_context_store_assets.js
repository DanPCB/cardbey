/**
 * Mission Pipeline tool: mcp_context_store_assets
 * Read-only store branding / asset metadata via MCP adapter registry (no UI, no new HTTP routes).
 */

import { executeMcpContextReadTool } from './executeMcpContextReadTool.js';

const ADAPTER_ID = 'mcp_context_store_assets';

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeMcpContextReadTool({
    adapterId: ADAPTER_ID,
    contextType: 'store_assets',
    input,
    context,
    buildInvokeArgs: (inp, ctx) => {
      const storeId = inp.storeId ?? ctx.storeId ?? null;
      return storeId != null && String(storeId).trim() ? { storeId: String(storeId).trim() } : {};
    },
  });
}
