/**
 * Mission Pipeline tool: mcp_context_products
 * Read-only product context via MCP adapter registry (no UI, no new HTTP routes).
 */

import { getMcpAdapter } from '../../mcp/adapterRegistry.js';
import { buildMcpInvocationEnvelope } from '../../mcp/invocationEnvelope.js';

const ADAPTER_ID = 'mcp_context_products';

/**
 * @param {object} [input]
 * @param {number} [input.limit]
 * @param {number} [input.offset]
 * @param {object} [context]
 * @param {string} [context.missionId]
 * @param {string} [context.stepId]
 * @param {string} [context.tenantId]
 * @param {string} [context.userId]
 */
export async function execute(input = {}, context = {}) {
  const adapter = getMcpAdapter(ADAPTER_ID);
  if (!adapter) {
    return {
      status: 'failed',
      error: {
        code: 'MCP_ADAPTER_NOT_REGISTERED',
        message: `${ADAPTER_ID} adapter missing — ensure registerDefaultAdapters is loaded`,
      },
    };
  }

  const envelope = buildMcpInvocationEnvelope({
    userId: context.userId ?? null,
    tenantId: context.tenantId ?? null,
    tenantKey: context.tenantId ?? null,
    missionId: context.missionId ?? null,
    intentId: context.stepId != null ? String(context.stepId) : null,
    source: 'mission_pipeline',
    adapterId: ADAPTER_ID,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Tool:mcp_context_products] invoke', {
      missionId: envelope.missionId,
      source: envelope.source,
      adapterId: envelope.adapterId,
      tenantKey: envelope.tenantKey,
      userId: envelope.userId ? '(set)' : '(missing)',
    });
  }

  const result = await adapter.invoke(
    {
      limit: input.limit,
      offset: input.offset,
    },
    envelope,
  );

  if (!result.success) {
    return {
      status: 'failed',
      error: result.error ?? { code: 'MCP_ADAPTER_FAILED', message: 'Adapter returned failure' },
      output: {
        success: false,
        metadata: result.metadata ?? { adapterId: ADAPTER_ID, missionId: envelope.missionId, source: envelope.source },
      },
    };
  }

  return {
    status: 'ok',
    output: {
      success: true,
      data: result.data,
      metadata: {
        ...(result.metadata && typeof result.metadata === 'object' ? result.metadata : {}),
        missionId: envelope.missionId,
        source: envelope.source,
        adapterId: ADAPTER_ID,
      },
    },
  };
}
