/**
 * Build graph nodes from match cohort specs for reciprocal match tests.
 */
import { normalizeMarketSignal } from '../normalizeMarketSignal.js';
import { buildMarketIntentAnalysis } from '../buildMarketIntentAnalysis.js';
import { parseMarketIntentLlmResponse } from '../marketIntentSchema.js';
import { mockLlmResponseForText } from './mockMarketIntentLlm.js';
import { projectMarketGraphNode } from '../marketGraphNode.js';
import type { MarketGraphNode } from '../marketGraphNode.js';
import type { MatchNodeSpec } from './matchPairCohort.js';
import { DEMAND_SIGNAL_COHORT } from './fixtures/demandSignalCohort.js';
import { MARKET_SIGNAL_COHORT } from './fixtures/marketSignalCohort.js';

function findDemandSignal(signalId: string) {
  const found = DEMAND_SIGNAL_COHORT.find((c) => c.signalId === signalId);
  if (!found) throw new Error(`Demand signal not found: ${signalId}`);
  return found;
}

function findCohortSignal(signalId: string) {
  const found = MARKET_SIGNAL_COHORT.find((c) => c.signalId === signalId);
  if (!found) throw new Error(`Cohort signal not found: ${signalId}`);
  return found;
}

export function buildGraphNodeFromSpec(spec: MatchNodeSpec): MarketGraphNode {
  if (spec.kind === 'anchor') {
    const signal = normalizeMarketSignal({
      signalId: spec.nodeId,
      sourceType: spec.sourceType ?? 'social_post_copy',
      sourceRef: spec.nodeId,
      rawText: spec.rawText,
    });
    const analysis = buildMarketIntentAnalysis(signal, spec.g1Override, 'llm');
    return projectMarketGraphNode({ nodeId: spec.nodeId, label: spec.label, analysis });
  }

  const caseDef = spec.kind === 'demand' ? findDemandSignal(spec.signalId) : findCohortSignal(spec.signalId);
  const signal = normalizeMarketSignal(caseDef);
  const extracted = parseMarketIntentLlmResponse(JSON.stringify(mockLlmResponseForText(signal.rawText)));
  const analysis = buildMarketIntentAnalysis(signal, extracted, 'llm');
  const nodeId = spec.signalId;
  return projectMarketGraphNode({ nodeId, label: spec.label, analysis });
}
