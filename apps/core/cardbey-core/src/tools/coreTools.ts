/**
 * Core business tools for DeepSeek tool calling.
 * Delegates execution to the canonical tool dispatcher where possible.
 */

import { dispatchTool } from '../lib/toolDispatcher.js';
import type { Tool, ToolExecutionContext, ToolResult } from './toolTypes.js';
import { getToolRegistry } from './ToolRegistry.js';

async function dispatchCoreTool(
  toolName: string,
  params: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolResult> {
  const result = await dispatchTool(toolName, params, {
    userId: context.userId ?? undefined,
    storeId: context.storeId ?? undefined,
    missionId: context.missionId ?? undefined,
    source: context.source ?? 'deepseek_tool_calling',
  });

  if (result.status === 'ok') {
    return {
      ok: true,
      data: result.output ?? {},
      summary: `Tool ${toolName} completed successfully.`,
    };
  }

  if (result.status === 'blocked') {
    return {
      ok: false,
      error: result.blocker?.message ?? 'Tool execution blocked — approval required.',
      data: result.blocker,
    };
  }

  return {
    ok: false,
    error: result.error?.message ?? `Tool ${toolName} failed`,
    data: result.error,
  };
}

export const CORE_TOOLS: Tool[] = [
  {
    name: 'fetch_campaign_analytics',
    description: 'Get campaign performance data including impressions, clicks, and conversions.',
    parameters: [
      { name: 'storeId', type: 'string', description: 'Store ID', required: true },
      { name: 'campaignId', type: 'string', description: 'Optional campaign ID filter' },
      { name: 'dateRange', type: 'string', description: 'Date range e.g. last_7_days, last_30_days' },
    ],
    execute: async (params, context) =>
      dispatchCoreTool(
        'get_store_analytics',
        { ...params, metric: 'campaign' },
        context,
      ),
  },
  {
    name: 'get_store_metrics',
    description: 'Retrieve store KPIs such as traffic, orders, and revenue summaries.',
    parameters: [
      { name: 'storeId', type: 'string', description: 'Store ID', required: true },
      { name: 'metric', type: 'string', description: 'Metric type: traffic, orders, revenue, overview' },
    ],
    execute: async (params, context) => dispatchCoreTool('get_store_analytics', params, context),
  },
  {
    name: 'create_campaign',
    description: 'Launch a new marketing campaign for a store.',
    parameters: [
      { name: 'storeId', type: 'string', description: 'Store ID', required: true },
      { name: 'goal', type: 'string', description: 'Campaign goal or description' },
      { name: 'name', type: 'string', description: 'Campaign name' },
    ],
    execute: async (params, context) => dispatchCoreTool('create_campaign', params, context),
  },
  {
    name: 'update_product_catalog',
    description: 'Modify product listings in the store catalog.',
    parameters: [
      { name: 'storeId', type: 'string', description: 'Store ID', required: true },
      { name: 'products', type: 'array', description: 'Product updates to apply' },
      { name: 'mode', type: 'string', description: 'Update mode: replace, merge, append' },
    ],
    execute: async (params, context) =>
      dispatchCoreTool('replace_store_catalog', params, context),
  },
  {
    name: 'send_notification',
    description: 'Send alerts or messages to store owners or customers.',
    parameters: [
      { name: 'storeId', type: 'string', description: 'Store ID', required: true },
      { name: 'channel', type: 'string', description: 'Channel: email, sms, push, in_app' },
      { name: 'message', type: 'string', description: 'Notification message body', required: true },
      { name: 'recipient', type: 'string', description: 'Recipient identifier' },
    ],
    execute: async (params, context) => {
      const channel = String(params.channel ?? 'in_app').trim();
      const toolName = channel === 'email' ? 'send_email' : 'send_notification';
      return dispatchCoreTool(toolName, params, context);
    },
  },
];

let coreToolsRegistered = false;

export function registerCoreTools(registry = getToolRegistry()): void {
  if (coreToolsRegistered) return;
  for (const tool of CORE_TOOLS) {
    registry.register(tool);
  }
  coreToolsRegistered = true;
}

export function resetCoreToolsRegistrationForTests(): void {
  coreToolsRegistered = false;
}
