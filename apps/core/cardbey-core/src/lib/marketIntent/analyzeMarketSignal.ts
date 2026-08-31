import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import {
  buildDegradedSemanticAnalysis,
  buildFailedAnalysis,
  buildMarketIntentAnalysis,
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
      return buildMarketIntentAnalysis(signal, llmResult.data, 'llm', null, {
        semanticStatus: 'AVAILABLE',
        analysisStatus: 'READY',
      });
    }

    const fallback = extractMarketIntentRuleAssisted(signal);
    if (fallback?.classification === 'NON_COMMERCIAL') {
      return buildMarketIntentAnalysis(signal, fallback, 'rule_assisted_fallback', llmResult.failureCode, {
        semanticStatus: 'UNAVAILABLE',
        analysisStatus: 'DEGRADED',
        semanticFailureCode: llmResult.failureCode,
      });
    }

    return buildDegradedSemanticAnalysis(signal, llmResult.failureCode, llmResult.reason);
  }

  const fallback = extractMarketIntentRuleAssisted(signal);
  if (!fallback) {
    return buildFailedAnalysis(signal, 'empty_or_invalid_signal_text');
  }

  return buildMarketIntentAnalysis(signal, fallback, 'rule_assisted_fallback', 'forced_rule_assisted', {
    semanticStatus: 'UNAVAILABLE',
    analysisStatus: 'DEGRADED',
  });
}
