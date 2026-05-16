/**
 * Orchestrates capability-aware v1 summary for Intake V2 enrichment (sync, no I/O).
 */

import type { CapabilityAssessmentSummary } from './types.ts';
import { getCapabilityById, getCapabilityRegistry } from './capabilityRegistryAdapter.ts';
import { extractRequirements } from './requirementExtractor.ts';
import { resolveCapabilityGaps } from './gapModel.ts';
import { derivePhase, deriveRole } from './roleContext.ts';
import { decidePremiumRouting, getDefaultPremiumPolicy } from './premiumRouting.ts';
import { selectStrategy } from './strategySelector.ts';
import { buildAcquisitionMap } from './acquisitionState.ts';

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
  const role = deriveRole(String(input.tool ?? input.intentFamily ?? '').trim());

  const requirements = extractRequirements(String(input.tool ?? input.intentFamily ?? '').trim(), {
    text: input.userMessage,
  });

  const capabilities = getCapabilityRegistry();
  const resolutions = resolveCapabilityGaps(requirements);

  const hasCriticalGap = resolutions.some(
    (r) => r.state === 'missing' && requirements.find((q) => q.id === r.requirementId)?.importance === 'critical',
  );
  const phase = derivePhase(null, requirements.length > 0, hasCriticalGap);

  const premiumPolicy = getDefaultPremiumPolicy(role);
  const premiumCapability =
    getCapabilityById(resolutions.find((resolution) => resolution.matchedCapabilityId)?.matchedCapabilityId ?? '') ??
    capabilities.find((capability) => capability.tier === 'premium') ??
    capabilities[0];
  const premiumDecision = premiumCapability
    ? decidePremiumRouting(premiumCapability, premiumPolicy, role)
    : undefined;

  const executionChoices = selectStrategy(
    resolutions,
    requirements,
    role,
    phase,
    premiumPolicy,
  );

  const acquisitionStates = buildAcquisitionMap(executionChoices);

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
