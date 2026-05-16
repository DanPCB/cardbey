/**
 * Mission Pipeline tool: mcp_context_promotions
 * Read-only promotion context via MCP adapter (Mission Execution → dispatchTool → executor → adapter).
 */

import { getMcpAdapter } from '../../mcp/adapterRegistry.js';
import { buildMcpInvocationEnvelope } from '../../mcp/invocationEnvelope.js';

const ADAPTER_ID = 'mcp_context_promotions';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const adapter = getMcpAdapter(ADAPTER_ID);
  if (!adapter) {
    return {
      status: 'failed',
      error: {
        code: 'MCP_ADAPTER_NOT_REGISTERED',
        message: `${ADAPTER_ID} adapter missing`,
      },
    };
  }

  const envelopeSource =
    typeof context.executionSource === 'string' && context.executionSource.trim()
      ? context.executionSource.trim()
      : 'mission_pipeline';

  const envelope = buildMcpInvocationEnvelope({
    userId: context.userId ?? null,
    tenantId: context.tenantId ?? null,
    tenantKey: context.tenantId ?? context.storeId ?? null,
    missionId: context.missionId ?? null,
    intentId: context.stepId != null ? String(context.stepId) : null,
    source: envelopeSource,
    adapterId: ADAPTER_ID,
  });

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
        metadata: result.metadata ?? { adapterId: ADAPTER_ID },
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
