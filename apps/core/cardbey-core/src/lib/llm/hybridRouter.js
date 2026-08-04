import deepseekAdapter from './deepseekAdapter.js';
import cloudAdapter from './cloudAdapter.js';
import groqAdapter from './groqAdapter.js';

let warnedHybridRouter = false;
function warnHybridRouterDeprecated() {
  if (warnedHybridRouter) return;
  warnedHybridRouter = true;
  console.warn(
    '[DEPRECATED] lib/llm/hybridRouter is deprecated. Use llmGateway instead ' +
      '(providers: anthropic|openai|deepseek|xai|kimi|groq).',
  );
}

export class HybridRouter {
  constructor() {
    warnHybridRouterDeprecated();
    this.thresholds = {
      deepseekOnly: 0.85,
      ensemble: 0.65,
      cloudFallback: 0.50
    };
  }

  async route(intent, context, memoryBundle) {
    warnHybridRouterDeprecated();
    const startTime = Date.now();
    
    // Step 1: Try Groq first (fast, free, no GPU)
    try {
      const groqResult = await groqAdapter.reason(context, memoryBundle);
      if (groqResult.ok && groqResult.confidence >= this.thresholds.deepseekOnly) {
        return {
          ...groqResult,
          decision: 'groq_only',
          totalLatency: Date.now() - startTime
        };
      }
    } catch (error) {
      console.log('[HybridRouter] Groq failed:', error.message);
    }
    
    // Step 2: Try DeepSeek (local, cheaper)
    try {
      const deepseekResult = await deepseekAdapter.reason(context, memoryBundle);
      if (deepseekResult.ok && deepseekResult.confidence >= this.thresholds.deepseekOnly) {
        return {
          ...deepseekResult,
          decision: 'deepseek_only',
          totalLatency: Date.now() - startTime
        };
      }
    } catch (error) {
      console.log('[HybridRouter] DeepSeek failed:', error.message);
    }
    
    // Step 3: Fallback to Cloud (OpenAI/Anthropic)
    const cloudResult = await cloudAdapter.reason(context, memoryBundle);
    return {
      ...cloudResult,
      decision: 'cloud_fallback',
      totalLatency: Date.now() - startTime
    };
  }
}

export default new HybridRouter();