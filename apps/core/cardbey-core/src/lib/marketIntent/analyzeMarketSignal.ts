import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import {
  buildFailedAnalysis,
  buildMarketIntentAnalysis,
  buildSemanticDegradedAnalysis,
} from './buildMarketIntentAnalysis.js';
import { extractMarketIntentWithLlm, type LlmGenerateFn } from './extractMarketIntentWithLlm.js';
import { extractMarketIntentRuleAssisted } from './extractMarketIntentRuleAssisted.js';

export type AnalyzeMarketSignalOptions = {
  tenantKey?: string;
  llmGenerate?: LlmGenerateFn;
  /** Force rule-assisted path (for tests). */
  forceRuleAssisted?: boolean;
};

export async function analyzeMarketSignal(
  signal: ExternalMarketSignal,
  options: AnalyzeMarketSignalOptions = {},
): Promise<MarketIntentAnalysis> {
  if (!options.forceRuleAssisted) {
    const llmResult = await extractMarketIntentWithLlm(signal, {
      tenantKey: options.tenantKey,
      llmGenerate: options.llmGenerate,
    });

    if (llmResult.ok) {
      return buildMarketIntentAnalysis(signal, llmResult.data, 'llm');
    }

    if (llmResult.code === 'LLM_PROVIDER_NOT_CONFIGURED') {
      const fallback = extractMarketIntentRuleAssisted(signal);
      if (!fallback) {
        return buildFailedAnalysis(signal, 'empty_or_invalid_signal_text');
      }
      return buildMarketIntentAnalysis(signal, fallback, 'rule_assisted_fallback', llmResult.code);
    }

    return buildSemanticDegradedAnalysis(signal, llmResult.code, llmResult.reason);
  }

  const fallback = extractMarketIntentRuleAssisted(signal);
  if (!fallback) {
    return buildFailedAnalysis(signal, 'empty_or_invalid_signal_text');
  }

  return buildMarketIntentAnalysis(signal, fallback, 'rule_assisted_fallback', 'forced_rule_assisted');
}
