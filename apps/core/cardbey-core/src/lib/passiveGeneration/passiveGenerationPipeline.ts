/**
 * Passive Intent-to-Artifact Autonomous Pipeline — Foundation Phase orchestrator.
 *
 * Canonical flow:
 *   Intent Input → Structuring → Gap Detection → Data Acquisition →
 *   Data Fusion / Confidence → Artifact Planning → Generation (advisory) →
 *   Exposure Planning → Continuous Enrichment hints
 *
 * Phase 1 constraints (enforced):
 * - advisory/read-only acquisition
 * - no autonomous publishing
 * - no automatic owner claims
 * - no background infinite crawling
 * - user confirmation before public generation
 */

import { randomUUID } from 'node:crypto';

import { appendTrace, createTrace, summarizeTrace, type PassiveGenerationTrace } from './passiveGenerationTrace.js';
import {
  structureIntent,
  detectMissingData,
  type IntentInput,
  type StructuredIntent,
  type DataGap,
} from './intentGapAnalyzer.js';
import { runAcquisitionPlan, type AcquisitionRunResult } from './acquisitionCoordinator.js';
import { mergeAcquiredData, type BusinessEntity } from './externalDataFusion.js';
import {
  planArtifacts,
  planContinuousEnrichment,
  type ArtifactPlanResult,
} from './artifactExposurePlanner.js';
import { listSources } from './acquisitionSourceRegistry.js';

export interface PassiveGenerationInput extends IntentInput {
  /** Skip acquisition (structure + gap analysis only). */
  dryRun?: boolean;
  minConfidence?: number;
}

export interface PassiveGenerationResult {
  ok: boolean;
  traceId: string;
  trace: PassiveGenerationTrace;
  traceSummary: ReturnType<typeof summarizeTrace>;
  intent: StructuredIntent;
  gaps: DataGap[];
  acquisition: AcquisitionRunResult | null;
  entity: BusinessEntity | null;
  artifactPlan: ArtifactPlanResult | null;
  /** Advisory generation payloads (NOT executed in Phase 1). */
  generationAdvisory: {
    storefrontPayload: { sourceType: string; payload: Record<string, unknown> } | null;
    message: string;
  };
  enrichmentHints: ReturnType<typeof planContinuousEnrichment>;
  /** Always true in Phase 1 — user must confirm before publish. */
  confirmationRequired: boolean;
  /** Performer-friendly status lines. */
  performerSummary: string[];
  sourcesAvailable: ReturnType<typeof listSources>;
}

/**
 * Run the full passive generation pipeline (foundation phase).
 */
export async function runPassiveGenerationPipeline(
  input: PassiveGenerationInput,
): Promise<PassiveGenerationResult> {
  const traceId = randomUUID();
  let trace = createTrace(traceId);

  trace = appendTrace(trace, 'intent_input', 'Received intent input', {
    hasText: Boolean(input.text),
    urlCount: input.urls?.length ?? 0,
    uploadCount: input.uploads?.length ?? 0,
  });

  const intent = structureIntent(input);
  trace = appendTrace(trace, 'intent_structuring', 'Structured intent extracted', {
    intentType: intent.intentType,
    desiredOutcome: intent.desiredOutcome,
    confidence: intent.confidence,
    entities: Object.keys(intent.entities),
  });

  const gaps = detectMissingData(intent);
  trace = appendTrace(trace, 'gap_detection', `Detected ${gaps.length} data gap(s)`, {
    gaps: gaps.map((g) => ({ field: g.field, priority: g.priority, task: g.acquisitionTask })),
  });

  let acquisition: AcquisitionRunResult | null = null;
  let entity: BusinessEntity | null = null;

  if (!input.dryRun && gaps.length > 0) {
    trace = appendTrace(trace, 'data_acquisition', 'Starting bounded acquisition');
    acquisition = await runAcquisitionPlan({ intent, gaps });
    trace = appendTrace(trace, 'data_acquisition', 'Acquisition complete', {
      executed: acquisition.tasksExecuted,
      planned: acquisition.tasksPlanned.length,
      skipped: acquisition.skipped,
    });
  } else if (gaps.length === 0) {
    trace = appendTrace(trace, 'data_acquisition', 'No gaps — acquisition skipped');
  } else {
    trace = appendTrace(trace, 'data_acquisition', 'Dry run — acquisition skipped');
  }

  trace = appendTrace(trace, 'data_fusion', 'Merging acquired data into entity graph');
  entity = mergeAcquiredData({
    userEntities: intent.entities,
    uploads: input.uploads ? { ...intent.entities, fromUploads: input.uploads } : undefined,
    acquisitions: acquisition?.payloads ?? [],
  });
  trace = appendTrace(trace, 'confidence_scoring', 'Confidence scored', {
    overall: entity.confidence,
    lowConfidenceFields: entity.lowConfidenceFields.map((f) => f.field),
  });

  const artifactPlan = planArtifacts(intent, entity, { minConfidence: input.minConfidence ?? 0.55 });
  trace = appendTrace(trace, 'artifact_planning', 'Artifact plan created', {
    artifacts: artifactPlan.artifacts.map((a) => ({ kind: a.kind, readiness: a.readiness })),
    sufficient: artifactPlan.sufficientForGeneration,
  });

  let storefrontPayload: { sourceType: string; payload: Record<string, unknown> } | null = null;
  if (artifactPlan.artifacts.some((a) => a.kind === 'store' || a.kind === 'business_profile')) {
    trace = appendTrace(trace, 'artifact_generation', 'Storefront generation advisory prepared (not executed)');
    storefrontPayload = {
      sourceType: 'passive_generation',
      payload: {
        businessName: entity.canonicalName.value ?? intent.entities.businessName ?? 'Untitled',
        businessType: entity.categories.value[0] ?? intent.entities.businessType,
        location: entity.geo.value.locality ?? entity.geo.value.address ?? intent.entities.location,
        website: entity.contact.value.website,
        phone: entity.contact.value.phone,
        socialLinks: entity.socialLinks.value,
      },
    };
  } else {
    trace = appendTrace(trace, 'artifact_generation', 'No storefront artifact planned');
  }

  trace = appendTrace(trace, 'exposure_planning', 'Exposure surfaces planned', {
    surfaces: artifactPlan.exposure.map((e) => e.surface),
    autoExpose: false,
  });

  const enrichmentHints = planContinuousEnrichment(entity);
  trace = appendTrace(trace, 'continuous_enrichment', 'Enrichment loop hints recorded', {
    hintCount: enrichmentHints.length,
  });

  trace = appendTrace(trace, 'confirmation_gate', 'User confirmation required before publish', {
    confirmationRequired: true,
  });

  const performerSummary = buildPerformerSummary(intent, gaps, acquisition, entity, artifactPlan);

  return {
    ok: true,
    traceId,
    trace,
    traceSummary: summarizeTrace(trace),
    intent,
    gaps,
    acquisition,
    entity,
    artifactPlan,
    generationAdvisory: {
      storefrontPayload,
      message: artifactPlan.confirmationRequired
        ? 'Review fused data and confirm before generating public artifacts.'
        : 'Ready for advisory generation — confirmation still required in Phase 1.',
    },
    enrichmentHints,
    confirmationRequired: true,
    performerSummary,
    sourcesAvailable: listSources({ configuredOnly: true }),
  };
}

function buildPerformerSummary(
  intent: StructuredIntent,
  gaps: DataGap[],
  acquisition: AcquisitionRunResult | null,
  entity: BusinessEntity | null,
  plan: ArtifactPlanResult | null,
): string[] {
  const lines: string[] = [];
  lines.push(`Intent: ${intent.intentType} → ${intent.desiredOutcome.join(', ')}`);

  if (gaps.length) {
    lines.push(`Missing: ${gaps.slice(0, 6).map((g) => g.field).join(', ')}${gaps.length > 6 ? '…' : ''}`);
  }

  if (acquisition) {
    const found = acquisition.payloads.filter((p) => p.ok);
    if (found.length) {
      lines.push(`Acquired from: ${[...new Set(found.map((p) => p.sourceId))].join(', ')}`);
    }
  }

  if (entity) {
    const foundItems: string[] = [];
    if (entity.geo.value.address || entity.geo.value.locality) foundItems.push('location');
    if (entity.mediaAssets.value.some((m) => m.role === 'hero')) foundItems.push('hero media');
    if (entity.openingHours.value) foundItems.push('opening hours');
    if (entity.menu.value) foundItems.push('menu');
    if (entity.contact.value.phone) foundItems.push('contact');
    if (foundItems.length) lines.push(`We found: ${foundItems.join(', ')}`);
    lines.push(`Confidence: ${Math.round(entity.confidence * 100)}%`);
  }

  if (plan?.artifacts.length) {
    const generating = plan.artifacts
      .filter((a) => a.readiness >= 0.5)
      .map((a) => a.kind.replace(/_/g, ' '));
    if (generating.length) {
      lines.push(`Generating (draft): ${generating.join(', ')}`);
    }
  }

  lines.push('Confirm before publish.');
  return lines;
}

export type { IntentInput, StructuredIntent, DataGap, BusinessEntity, ArtifactPlanResult, PassiveGenerationTrace };
