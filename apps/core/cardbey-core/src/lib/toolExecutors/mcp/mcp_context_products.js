/**
 * Mission Pipeline tool: mcp_context_products
 * Read-only product context via MCP adapter registry (no UI, no new HTTP routes).
 */

import { executeMcpContextReadTool } from './executeMcpContextReadTool.js';

const ADAPTER_ID = 'mcp_context_products';

/**
 * @param {object} [input]
 * @param {number} [input.limit]
 * @param {number} [input.offset]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeMcpContextReadTool({
    adapterId: ADAPTER_ID,
    contextType: 'products',
    input,
    context,
    buildInvokeArgs: (inp) => ({
      limit: inp.limit,
      offset: inp.offset,
    }),
  });
}
