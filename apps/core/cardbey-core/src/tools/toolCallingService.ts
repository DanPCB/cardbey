/**
 * DeepSeek tool-calling loop — uses llmGateway native tool_calls + ToolRegistry execution.
 */

import { randomUUID } from 'node:crypto';
import { complete } from '../lib/llm/llmGateway.js';
import type { LLMChatMessage } from '../lib/llm/llmGatewayTypes.js';
import { loadDeepSeekConfig } from '../multiAgent/config/deepseek.config.js';
import { registerCoreTools } from './coreTools.js';
import { getToolRegistry } from './ToolRegistry.js';
import type { ToolCallTrace, ToolCallingResult, ToolExecutionContext } from './toolTypes.js';

export interface ToolCallingOptions {
  userMessage: string;
  systemPrompt?: string;
  context?: ToolExecutionContext;
  tenantKey?: string;
  maxIterations?: number;
  toolNames?: string[];
  cancelled?: () => boolean;
}

const DEFAULT_SYSTEM =
  'You are Cardbey Performer, a business operations assistant. Use tools to fetch live data and take actions when needed. Summarize results clearly for the user.';

function isToolCallingEnabled(): boolean {
  return String(process.env.DEEPSEEK_TOOL_CALLING_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

export async function runToolCallingLoop(options: ToolCallingOptions): Promise<ToolCallingResult> {
  if (!isToolCallingEnabled()) {
    return { content: options.userMessage, toolCalls: [] };
  }

  registerCoreTools();
  const registry = getToolRegistry();
  const cfg = loadDeepSeekConfig();

  const allowedTools = options.toolNames?.length
    ? registry.list().filter((t) => options.toolNames!.includes(t.name))
    : registry.list();

  const llmTools = allowedTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: registry.toLlmToolDefinitions().find((d) => d.name === t.name)?.parameters ?? {
      type: 'object',
      properties: {},
    },
  }));

  const messages: LLMChatMessage[] = [
    { role: 'system', content: options.systemPrompt ?? DEFAULT_SYSTEM },
    { role: 'user', content: options.userMessage },
  ];

  const toolCalls: ToolCallTrace[] = [];
  const maxIterations = options.maxIterations ?? 5;
  const execContext = options.context ?? {};
  const tenantKey = options.tenantKey ?? execContext.userId ?? 'default';

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (options.cancelled?.()) {
      toolCalls.push({
        id: randomUUID(),
        name: '_cancelled',
        status: 'cancelled',
      });
      break;
    }

    const response = await complete({
      purpose: 'deepseek_tool_calling',
      tenantKey,
      provider: 'deepseek',
      model: cfg.model,
      messages,
      tools: llmTools,
      tool_choice: llmTools.length > 0 ? 'auto' : 'none',
      thinking: cfg.thinking.type === 'enabled',
      maxTokens: cfg.maxTokens,
      temperature: 0.3,
    });

    const calls = response.tool_calls ?? [];
    if (!calls.length) {
      return {
        content: response.content || response.text || '',
        toolCalls,
        thinkingText: response.thinkingText,
      };
    }

    messages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: calls,
    });

    for (const call of calls) {
      const startedAt = new Date().toISOString();
      const startMs = Date.now();
      const trace: ToolCallTrace = {
        id: call.id || randomUUID(),
        name: call.name,
        status: 'running',
        parameters: call.parameters,
        startedAt,
      };
      toolCalls.push(trace);

      const result = await registry.execute(call.name, call.parameters ?? {}, execContext);
      const completedAt = new Date().toISOString();
      trace.status = result.ok ? 'completed' : 'failed';
      trace.result = result;
      trace.completedAt = completedAt;
      trace.durationMs = Date.now() - startMs;

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify(result),
      });
    }
  }

  const final = await complete({
    purpose: 'deepseek_tool_calling_final',
    tenantKey,
    provider: 'deepseek',
    model: cfg.model,
    messages,
    maxTokens: cfg.maxTokens,
    temperature: 0.3,
  });

  return {
    content: final.content || final.text || 'I completed the requested tool actions.',
    toolCalls,
    thinkingText: final.thinkingText,
  };
}
