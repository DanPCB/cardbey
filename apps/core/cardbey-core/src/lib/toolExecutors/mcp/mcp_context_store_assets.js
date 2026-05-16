/**
 * Mission Pipeline tool: mcp_context_store_assets
 * Read-only store branding / asset metadata via MCP adapter registry (no UI, no new HTTP routes).
 */

import { getMcpAdapter } from '../../mcp/adapterRegistry.js';
import { buildMcpInvocationEnvelope } from '../../mcp/invocationEnvelope.js';

const ADAPTER_ID = 'mcp_context_store_assets';

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 * @param {object} [context]
 * @param {string} [context.missionId]
 * @param {string} [context.stepId]
 * @param {string} [context.tenantId]
 * @param {string} [context.userId]
 * @param {string} [context.storeId]
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
    console.log('[Tool:mcp_context_store_assets] invoke', {
      missionId: envelope.missionId,
      source: envelope.source,
      adapterId: envelope.adapterId,
      tenantKey: envelope.tenantKey,
      userId: envelope.userId ? '(set)' : '(missing)',
    });
  }

  const storeId = input.storeId ?? context.storeId ?? null;
  const result = await adapter.invoke(
    {
      ...(storeId != null && String(storeId).trim() ? { storeId: String(storeId).trim() } : {}),
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
