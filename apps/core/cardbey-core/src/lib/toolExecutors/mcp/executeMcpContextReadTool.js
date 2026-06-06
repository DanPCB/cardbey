/**
 * Shared honest executor for read-only MCP context tools.
 * Validates adapter results; returns blocked when empty, failed on errors.
 */

import { getMcpAdapter } from '../../mcp/adapterRegistry.js';
import { buildMcpInvocationEnvelope } from '../../mcp/invocationEnvelope.js';

/** @typedef {'analytics' | 'business' | 'products' | 'missions' | 'promotions' | 'store_assets'} McpContextType */

/**
 * @param {McpContextType} contextType
 * @param {unknown} data
 * @returns {boolean}
 */
function isEmptyContextData(contextType, data) {
  if (data == null || typeof data !== 'object') return true;

  switch (contextType) {
    case 'analytics':
      return !('summary' in data);
    case 'business':
      return !Array.isArray(data.businesses) || data.businesses.length === 0;
    case 'products':
      return (
        !Array.isArray(data.resources) ||
        (data.resources.length === 0 && (data.pagination?.total ?? 0) === 0)
      );
    case 'missions':
      return !Array.isArray(data.missions) || data.missions.length === 0;
    case 'promotions':
      return !Array.isArray(data.promotions) || data.promotions.length === 0;
    case 'store_assets':
      return !Array.isArray(data.assets) || data.assets.length === 0;
    default:
      return false;
  }
}

/**
 * @param {McpContextType} contextType
 * @param {unknown} data
 * @returns {number | null}
 */
function countContextRecords(contextType, data) {
  if (data == null || typeof data !== 'object') return null;

  switch (contextType) {
    case 'analytics':
      return 1;
    case 'business':
      return Array.isArray(data.businesses) ? data.businesses.length : 0;
    case 'products':
      return Array.isArray(data.resources) ? data.resources.length : 0;
    case 'missions':
      return Array.isArray(data.missions) ? data.missions.length : data.missionCount ?? 0;
    case 'promotions':
      return Array.isArray(data.promotions) ? data.promotions.length : data.promotionCount ?? 0;
    case 'store_assets':
      return Array.isArray(data.assets) ? data.assets.length : 0;
    default:
      return null;
  }
}

/**
 * @param {object} options
 * @param {string} options.adapterId
 * @param {McpContextType} options.contextType
 * @param {object} [options.input]
 * @param {object} [options.context]
 * @param {(input: object, context: object) => object} [options.buildInvokeArgs]
 * @param {boolean} [options.useStoreTenantKey]
 */
export async function executeMcpContextReadTool({
  adapterId,
  contextType,
  input = {},
  context = {},
  buildInvokeArgs,
  useStoreTenantKey = false,
}) {
  const adapter = getMcpAdapter(adapterId);
  if (!adapter) {
    return {
      status: 'failed',
      error: {
        code: 'MCP_ADAPTER_NOT_REGISTERED',
        message: `${adapterId} adapter missing — ensure registerDefaultAdapters is loaded`,
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
    tenantKey: useStoreTenantKey ? (context.tenantId ?? context.storeId ?? null) : (context.tenantId ?? null),
    missionId: context.missionId ?? null,
    intentId: context.stepId != null ? String(context.stepId) : null,
    source: envelopeSource,
    adapterId,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Tool:${adapterId}] invoke`, {
      missionId: envelope.missionId,
      source: envelope.source,
      adapterId: envelope.adapterId,
      tenantKey: envelope.tenantKey,
      userId: envelope.userId ? '(set)' : '(missing)',
    });
  }

  const invokeArgs =
    typeof buildInvokeArgs === 'function' ? buildInvokeArgs(input, context) : { ...input };

  let result;
  try {
    result = await adapter.invoke(invokeArgs, envelope);
  } catch (err) {
    console.error(`[Tool:${adapterId}] adapter invoke failed:`, err?.message || err);
    return {
      status: 'failed',
      reason: `${contextType}_service_error`,
      message: err?.message || String(err),
      error: {
        code: 'MCP_ADAPTER_INVOKE_ERROR',
        message: err?.message || String(err),
      },
      output: {
        storeId: input.storeId ?? context.storeId ?? null,
        adapterId,
      },
    };
  }

  if (!result?.success) {
    return {
      status: 'failed',
      error: result.error ?? { code: 'MCP_ADAPTER_FAILED', message: 'Adapter returned failure' },
      output: {
        success: false,
        metadata: result.metadata ?? { adapterId },
      },
    };
  }

  if (isEmptyContextData(contextType, result.data)) {
    return {
      status: 'blocked',
      reason: `no_${contextType}_data`,
      message: `No ${contextType.replace(/_/g, ' ')} data available`,
      output: {
        data: result.data ?? null,
        storeId: input.storeId ?? context.storeId ?? null,
        adapterId,
      },
    };
  }

  const recordsFound = countContextRecords(contextType, result.data);

  return {
    status: 'ok',
    output: {
      success: true,
      data: result.data,
      recordsFound,
      metadata: {
        ...(result.metadata && typeof result.metadata === 'object' ? result.metadata : {}),
        missionId: envelope.missionId,
        source: envelope.source,
        adapterId,
      },
    },
  };
}
