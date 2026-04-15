/**
 * Orchestrates capability-aware v1 summary for Intake V2 enrichment (sync, no I/O).
 */

import type { CapabilityAssessmentSummary } from './types.ts';
import { getCapabilityRegistry } from './capabilityRegistryAdapter.ts';
import { extractMissionRequirements } from './requirementExtractor.ts';
import { resolveCapabilityGaps } from './gapModel.ts';
import { deriveRoleAndPhase } from './roleContext.ts';
import { decidePremiumRouting } from './premiumRouting.ts';
import { selectExecutionStrategies } from './strategySelector.ts';
import { buildAcquisitionStatesFromResolutions } from './acquisitionState.ts';

export interface BuildCapabilityAssessmentInput {
  userMessage: string;
  tool?: string | null;
  executionPath?: string | null;
  intentFamily?: string | null;
  intentSubtype?: string | null;
  hasStoreId?: boolean;
  hasDraftId?: boolean;
  hasImageAttachment?: boolean;
  isGuest: boolean;
}

export function buildCapabilityAssessmentSummary(input: BuildCapabilityAssessmentInput): CapabilityAssessmentSummary {
  const { role, phase } = deriveRoleAndPhase({
    userMessage: input.userMessage,
    tool: input.tool,
    executionPath: input.executionPath,
    intentFamily: input.intentFamily,
    intentSubtype: input.intentSubtype,
    hasStoreId: input.hasStoreId,
    hasDraftId: input.hasDraftId,
  });

  const requirements = extractMissionRequirements({
    userMessage: input.userMessage,
    tool: input.tool,
    intentFamily: input.intentFamily,
    intentSubtype: input.intentSubtype,
    hasStoreId: input.hasStoreId,
    hasDraftId: input.hasDraftId,
    hasImageAttachment: input.hasImageAttachment,
  });

  const capabilities = getCapabilityRegistry();
  const resolutions = resolveCapabilityGaps(requirements, capabilities, {
    activeTool: input.tool,
    hasStoreId: input.hasStoreId,
    hasDraftId: input.hasDraftId,
  });

  const hasCriticalGap = resolutions.some(
    (r) => r.state === 'missing' && requirements.find((q) => q.id === r.requirementId)?.importance === 'critical',
  );

  const premiumDecision = decidePremiumRouting({
    isGuest: input.isGuest,
    hasCriticalGap,
    userRequestedPremium: /\bpremium\b|\bpag\b|\bpps\b/i.test(input.userMessage),
  });

  const executionChoices = selectExecutionStrategies({
    resolutions,
    role,
    phase,
    premiumDecision,
    isGuest: input.isGuest,
  });

  const acquisitionStates = buildAcquisitionStatesFromResolutions(resolutions, executionChoices);

  return {
    schemaVersion: 1,
    role,
    phase,
    requirements,
    resolutions,
    executionChoices,
    premiumDecision,
    acquisitionStates,
    generatedAt: new Date().toISOString(),
  };
}
