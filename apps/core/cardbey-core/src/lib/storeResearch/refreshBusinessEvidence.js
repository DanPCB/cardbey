/**
 * Phase 9 — Refresh business evidence (detect changes; never auto-publish).
 */

import { resolveBusinessEntity, isExistingBusinessIntent } from './businessEntityResolver.js';
import { discoverBusinessSources } from './sourceDiscoveryService.js';
import { runStoreCreationResearch } from '../storeCreationResearch/businessResearchAgent.js';
import { reconcileBusinessEvidence } from './businessEvidenceReconciler.js';

/**
 * @param {object} params
 * @param {string} params.storeId
 * @param {object} params.storeMetadata - store.metadata including research provenance
 * @param {object} params.businessInput - name, location, website, phone
 */
export async function refreshBusinessEvidence({ storeId, storeMetadata = {}, businessInput = {} }) {
  const prior = storeMetadata?.research ?? storeMetadata?.meta?.research ?? null;
  const logs = [];

  if (!isExistingBusinessIntent(businessInput)) {
    return {
      ok: false,
      reason: 'not_existing_business',
      changes: [],
      logs,
    };
  }

  const entityResolution = await resolveBusinessEntity({
    businessName: businessInput.businessName,
    location: businessInput.location,
    websiteHint: businessInput.website,
    phoneHint: businessInput.phone,
  });

  const sources = await discoverBusinessSources(businessInput, (msg) => logs.push(msg));
  const legacy = await runStoreCreationResearch(businessInput, { skipNetwork: false });

  const providerResults = legacy?.researchEvidence?.providerResults ?? [];
  const { evidence } = reconcileBusinessEvidence({
    providerResults,
    entityId: entityResolution.selectedCandidate?.entityId ?? null,
  });

  /** @type {Array<{ field: string, before: unknown, after: unknown, severity: 'info'|'review_required' }>} */
  const changes = [];

  if (prior?.fieldProvenance) {
    const priorHours = prior.fieldProvenance.openingHours?.[0]?.value;
    const nextHours = evidence?.profile?.openingHours?.value;
    if (priorHours && nextHours && JSON.stringify(priorHours) !== JSON.stringify(nextHours)) {
      changes.push({
        field: 'openingHours',
        before: priorHours,
        after: nextHours,
        severity: 'review_required',
      });
    }
  }

  const priorCatalogNames = new Set(
    (prior?.catalogSnapshot ?? []).map((i) => String(i?.name ?? '').toLowerCase()).filter(Boolean),
  );
  const nextNames = new Set(
    (evidence?.catalogItems ?? []).map((i) => String(i?.name ?? '').toLowerCase()).filter(Boolean),
  );
  for (const name of nextNames) {
    if (!priorCatalogNames.has(name)) {
      changes.push({ field: 'catalog.added', before: null, after: name, severity: 'review_required' });
    }
  }
  for (const name of priorCatalogNames) {
    if (!nextNames.has(name)) {
      changes.push({ field: 'catalog.removed', before: name, after: null, severity: 'review_required' });
    }
  }

  return {
    ok: true,
    storeId,
    entityResolution,
    sources,
    evidence,
    changes,
    autoPublish: false,
    policy: 'owner_review_required_before_publish',
    logs,
  };
}
