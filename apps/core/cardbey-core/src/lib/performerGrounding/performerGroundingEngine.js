/**
 * PerformerGroundingEngine — universal source-grounding pipeline.
 */

import { randomUUID } from 'node:crypto';
import { BusinessSourceResolver } from './businessSourceResolver.js';
import { compileSourceGroundedCatalog, groundedCatalogDraftToLegacyCatalog } from './sourceGroundedCatalogCompiler.js';
import { computeBusinessFidelityScore } from './businessFidelityScore.js';
import { emitGroundingTelemetry, GROUNDING_TELEMETRY } from './groundingTelemetry.js';
import {
  DEFAULT_FALLBACK_POLICY,
  DEFAULT_SOURCE_POLICY,
} from './performerGroundingTypes.js';

/**
 * @template TIntent, TOutput
 * @param {{
 *   intent: TIntent;
 *   intentFamily: string;
 *   evidence: import('./performerGroundingTypes.js').BusinessContentEvidence;
 *   evidenceSnapshotId?: string;
 *   sourcePolicy?: import('./performerGroundingTypes.js').SourcePolicy;
 *   fallbackPolicy?: import('./performerGroundingTypes.js').FallbackPolicy;
 *   missionId?: string | null;
 *   storeId?: string | null;
 *   compileCatalog?: boolean;
 * }} params
 * @returns {import('./performerGroundingTypes.js').GroundedGenerationResult<TOutput> & { catalogDraft?: import('./performerGroundingTypes.js').SourceGroundedCatalogDraft; fidelity?: import('./performerGroundingTypes.js').BusinessFidelityScore; legacyCatalog?: object }}
 */
export function runPerformerGrounding(params) {
  const evidence = params.evidence;
  const snapshotId = params.evidenceSnapshotId ?? `evidence_${randomUUID().slice(0, 12)}`;
  const sourcePolicy = { ...DEFAULT_SOURCE_POLICY, ...(params.sourcePolicy ?? {}) };
  const fallbackPolicy = { ...DEFAULT_FALLBACK_POLICY, ...(params.fallbackPolicy ?? {}) };

  emitGroundingTelemetry(GROUNDING_TELEMETRY.STARTED, {
    missionId: params.missionId ?? null,
    storeId: params.storeId ?? null,
    intentFamily: params.intentFamily,
    sourceCount: evidence?.sourceDocuments?.length ?? 0,
  });

  const { identity, conflicts: identityConflicts } = BusinessSourceResolver.resolveIdentity(evidence, sourcePolicy);
  const { conflicts: catalogConflicts } = BusinessSourceResolver.resolveCatalog(evidence);
  const conflicts = [...identityConflicts, ...catalogConflicts, ...(evidence.conflicts ?? [])];

  if (conflicts.length) {
    emitGroundingTelemetry(GROUNDING_TELEMETRY.CONFLICT_DETECTED, {
      missionId: params.missionId ?? null,
      intentFamily: params.intentFamily,
      conflictCount: conflicts.length,
    });
  }

  let catalogDraft = null;
  let legacyCatalog = null;
  if (params.compileCatalog !== false) {
    catalogDraft = compileSourceGroundedCatalog(evidence, { fallbackPolicy });
    legacyCatalog = groundedCatalogDraftToLegacyCatalog(catalogDraft, {
      businessName: identity.canonicalName ?? identity.tradingName,
    });

    emitGroundingTelemetry(GROUNDING_TELEMETRY.CONTENT_EXTRACTED, {
      missionId: params.missionId ?? null,
      intentFamily: params.intentFamily,
      exactCount: catalogDraft.counts.exact,
      verifiedCount: catalogDraft.counts.verified,
      inferredCount: catalogDraft.counts.inferred,
      fallbackCount: catalogDraft.counts.fallback,
    });

    if (catalogDraft.counts.fallback > 0) {
      emitGroundingTelemetry(GROUNDING_TELEMETRY.FALLBACK_USED, {
        missionId: params.missionId ?? null,
        fallbackCount: catalogDraft.counts.fallback,
      });
    }
  }

  const fidelity = computeBusinessFidelityScore({ evidence, catalogDraft });
  const provenanceSummary = catalogDraft?.counts ?? {
    exact: 0,
    verified: 0,
    inferred: 0,
    fallback: 0,
    total: 0,
  };

  const requiresOwnerReview =
    conflicts.length > 0 ||
    fidelity.blockers.length > 0 ||
    provenanceSummary.inferred > 0 ||
    provenanceSummary.fallback > 0 ||
    (evidence.unresolvedFields?.length ?? 0) > 0;

  /** @type {any} */
  const output = {
    businessIdentity: identity,
    sourceSnapshotId: snapshotId,
    catalog: catalogDraft,
    legacyCatalog,
  };

  return {
    output,
    catalogDraft,
    legacyCatalog,
    fidelity,
    provenanceSummary: {
      exactCount: provenanceSummary.exact,
      verifiedCount: provenanceSummary.verified,
      inferredCount: provenanceSummary.inferred,
      fallbackCount: provenanceSummary.fallback,
    },
    confidence: fidelity.overall / 100,
    conflicts,
    missingFields: evidence.unresolvedFields ?? [],
    requiresOwnerReview,
  };
}

export const PerformerGroundingEngine = { run: runPerformerGrounding };
export default PerformerGroundingEngine;
