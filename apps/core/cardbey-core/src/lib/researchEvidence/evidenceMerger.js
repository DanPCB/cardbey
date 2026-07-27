import { detectEvidenceConflict, scoreEvidenceFact, summarizeEvidenceConfidence } from './confidenceScorer.js';
import { EVIDENCE_TIERS } from './evidenceTiers.js';
import { resolveOwnerVerificationStatus } from './ownerVerificationState.js';

function pushFactEvidence(index, fieldPath, row) {
  const bucket = index[fieldPath] ?? [];
  bucket.push(row);
  index[fieldPath] = bucket;
}

function summarizeEvidenceIds(rows = []) {
  return rows.map((row) => row.evidenceId).filter(Boolean);
}

function sortCandidates(rows = []) {
  return [...rows].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });
}

function isSuggestOnlyTier(tier) {
  return tier === EVIDENCE_TIERS.CUSTOMER_CONTENT || tier === EVIDENCE_TIERS.SOCIAL_CONTENT;
}

function pickWinningFact(rows = []) {
  const candidates = sortCandidates(rows);
  const uploadedAuthority = candidates.find(
    (row) => row.tier === EVIDENCE_TIERS.BUSINESS_DOCUMENT && (row.confidence ?? 0) >= 0.85,
  );
  if (uploadedAuthority) return uploadedAuthority;
  const usable = candidates.filter((row) => !isSuggestOnlyTier(row.tier));
  return usable[0] ?? candidates[0] ?? null;
}

export function mergeEvidence(providerResults = []) {
  const evidenceIndex = {};
  const fields = ['businessName', 'category', 'description', 'address', 'phone', 'email', 'website', 'openingHours'];
  /** @type {Array<{ fieldPath: string, contenders: Array<{ value: unknown, confidence: number, tier: number, evidenceIds: string[] }> }>} */
  const conflicts = [];
  for (const result of providerResults) {
    for (const field of fields) {
      const value = result?.businessFacts?.[field];
      if (value == null || value === '') continue;
      const evidence = (result.sourceEvidence ?? []).find((row) => row.fieldPath === `businessFacts.${field}`);
      pushFactEvidence(evidenceIndex, field, {
        value,
        confidence: result.confidence,
        tier: result.tier,
        providerId: result.providerId,
        providerName: result.providerName,
        sourceType: result.sourceType,
        sourceUrl: result.sourceUrl,
        evidenceId: evidence?.id ?? `${result.providerId}:${field}`,
      });
    }
  }

  const mergedFacts = {};
  for (const [fieldPath, rows] of Object.entries(evidenceIndex)) {
    const conflict = detectEvidenceConflict(rows);
    if (conflict) {
      conflicts.push({ fieldPath, contenders: conflict.contenders });
    }
    const winner = pickWinningFact(rows);
    if (!winner) continue;
    mergedFacts[fieldPath] = {
      value: winner.value,
      confidence: scoreEvidenceFact(winner),
      tier: winner.tier,
      providerId: winner.providerId,
      providerName: winner.providerName,
      sourceType: winner.sourceType,
      sourceUrl: winner.sourceUrl,
      sourceEvidenceIds: summarizeEvidenceIds(rows),
      ownerVerifiedStatus: resolveOwnerVerificationStatus({
        conflict: Boolean(conflict),
        sourceType: winner.sourceType,
        confidence: winner.confidence,
      }),
      conflict: Boolean(conflict),
      conflictingValues: conflict?.contenders ?? [],
    };
  }

  const mergedCatalogItems = providerResults
    .flatMap((result) =>
      (result.catalogItems ?? []).map((item, index) => ({
        ...item,
        providerId: result.providerId,
        providerName: result.providerName,
        tier: result.tier,
        sourceType: result.sourceType,
        sourceUrl: result.sourceUrl,
        confidence: scoreEvidenceFact({ confidence: result.confidence, tier: result.tier }),
        ownerVerifiedStatus: resolveOwnerVerificationStatus({
          sourceType: result.sourceType,
          confidence: result.confidence,
        }),
        sourceEvidenceIds: (result.sourceEvidence ?? [])
          .filter((row) => row.fieldPath === 'catalogItems')
          .map((row) => row.id || `${result.providerId}:catalogItems.${index}`),
      })),
    )
    .filter((item) => item && item.name)
    .sort((a, b) => (a.tier - b.tier) || (b.confidence - a.confidence));

  return {
    mergedFacts,
    catalogItems: mergedCatalogItems,
    evidenceIndex,
    conflicts,
    confidenceSummary: {
      overall: summarizeEvidenceConfidence(providerResults),
      providerCount: providerResults.length,
      conflictCount: conflicts.length,
    },
  };
}
