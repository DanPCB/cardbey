/**
 * Cardbey Performer Multi-Agent Integration
 * Phase 2: agents call llmGateway (default provider: deepseek).
 * Direct DeepSeek OpenAI-SDK client is deprecated — see BaseAgent.
 */

let warnedMultiAgentImport = false;
function warnMultiAgentGatewayDefault(): void {
  if (warnedMultiAgentImport) return;
  if (process.env.NODE_ENV === 'test') return;
  warnedMultiAgentImport = true;
  console.warn(
    '[DEPRECATED] Prefer llmGateway for multiAgent LLM calls (provider: "deepseek" by default). ' +
      'Set MULTIAGENT_PROVIDER to swap (kimi|anthropic|openai|groq). ' +
      'Rollback: MULTIAGENT_USE_GATEWAY=false.',
  );
}
warnMultiAgentGatewayDefault();

export * from './types/index.js';
export * from './config/index.js';
export * from './agents/index.js';
export * from './orchestrator/index.js';
export * from './telemetry/index.js';
export * from './monitoring/index.js';
export * from './utils/index.js';
