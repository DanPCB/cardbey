import { EVIDENCE_TIERS } from './evidenceTiers.js';

export function scoreEvidenceFact(entry = {}) {
  const confidence = typeof entry.confidence === 'number' ? entry.confidence : 0;
  const tier = typeof entry.tier === 'number' ? entry.tier : EVIDENCE_TIERS.AI_FALLBACK;
  const tierBonus = Math.max(0, 8 - tier) * 0.03;
  return Math.max(0, Math.min(1, confidence + tierBonus));
}

export function summarizeEvidenceConfidence(providerResults = []) {
  const weighted = providerResults
    .map((row) => scoreEvidenceFact({ confidence: row.confidence, tier: row.tier }))
    .filter((n) => Number.isFinite(n));
  if (!weighted.length) return 0;
  return weighted.reduce((sum, n) => sum + n, 0) / weighted.length;
}

export function detectEvidenceConflict(values = []) {
  const normalized = values
    .map((row) => ({
      value: typeof row?.value === 'string' ? row.value.trim().toLowerCase() : row?.value,
      confidence: typeof row?.confidence === 'number' ? row.confidence : 0,
      tier: typeof row?.tier === 'number' ? row.tier : 99,
      evidenceId: row?.evidenceId ?? null,
    }))
    .filter((row) => row.value != null && row.value !== '');
  if (normalized.length < 2) return null;
  const groups = new Map();
  for (const row of normalized) {
    const key = String(row.value);
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  if (groups.size <= 1) return null;
  const contenders = [...groups.values()]
    .map((bucket) => ({
      value: bucket[0].value,
      confidence: Math.max(...bucket.map((x) => x.confidence)),
      tier: Math.min(...bucket.map((x) => x.tier)),
      evidenceIds: bucket.map((x) => x.evidenceId).filter(Boolean),
    }))
    .sort((a, b) => (b.confidence - a.confidence) || (a.tier - b.tier));
  if (!contenders.length) return null;
  return {
    needsOwnerReview: true,
    contenders,
  };
}
