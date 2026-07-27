/**
 * Sanitize readiness snapshot for API / PIL — strip secrets, paths, credentials.
 */

import { sanitizeEvidenceObject } from './evidence.js';

const FORBIDDEN_KEY_RE =
  /(password|secret|token|credential|api[_-]?key|private[_-]?key|authorization|cookie|session|signed|filepath|file_path|absolutePath|localPath)/i;

const PATH_RE = /(^[a-zA-Z]:\\|^\/(?:Users|home|var|tmp|opt)\b|file:\/\/|\\\\)/;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function looksLikeSecretOrPath(value) {
  if (typeof value !== 'string') return false;
  if (FORBIDDEN_KEY_RE.test(value) && value.length > 20) return true;
  if (PATH_RE.test(value)) return true;
  if (/Bearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(value)) return true;
  return false;
}

/**
 * @param {import('./types.js').StoreReadinessSnapshot} snapshot
 * @returns {import('./types.js').StoreReadinessSnapshot}
 */
export function sanitizeStoreReadinessSnapshot(snapshot) {
  const cleanLines = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((e) => String(e))
      .filter((e) => !looksLikeSecretOrPath(e))
      .map((e) => (e.length > 200 ? `${e.slice(0, 197)}...` : e));

  const cleanFinding = (f) => {
    const evidenceObj =
      f.evidence && typeof f.evidence === 'object' && !Array.isArray(f.evidence)
        ? sanitizeEvidenceObject(f.evidence, looksLikeSecretOrPath)
        : sanitizeEvidenceObject(
            { notes: Array.isArray(f.evidence) ? f.evidence : [] },
            looksLikeSecretOrPath,
          );
    return {
      ...f,
      evidence: evidenceObj,
      evidenceLines: cleanLines(f.evidenceLines || Object.entries(evidenceObj).map(([k, v]) => `${k}=${v}`)),
      destination:
        typeof f.destination === 'string' && !looksLikeSecretOrPath(f.destination)
          ? f.destination
          : f.destination && looksLikeSecretOrPath(f.destination)
            ? null
            : f.destination,
      pilCanExecute: false,
    };
  };

  const cleanAction = (a) => ({
    ...a,
    evidence:
      a.evidence && typeof a.evidence === 'object'
        ? sanitizeEvidenceObject(a.evidence, looksLikeSecretOrPath)
        : a.evidence,
    destination:
      typeof a.destination === 'string' && looksLikeSecretOrPath(a.destination)
        ? null
        : a.destination,
    pilCanExecute: false,
  });

  return {
    storeId: String(snapshot.storeId),
    ownerUserId: String(snapshot.ownerUserId),
    generatedAt: String(snapshot.generatedAt),
    overallScore: Number(snapshot.overallScore) || 0,
    status: snapshot.status,
    sections: snapshot.sections,
    findings: (snapshot.findings || []).map(cleanFinding),
    recommendedActions: (snapshot.recommendedActions || []).map(cleanAction),
    primaryActions: (snapshot.primaryActions || []).map(cleanAction),
    vertical: snapshot.vertical || null,
    diagnostics: snapshot.diagnostics || null,
  };
}

/**
 * Seller-safe PIL context — subset only, no raw DB rows.
 * @param {import('./types.js').StoreReadinessSnapshot} snapshot
 */
export function toSellerPilContext(snapshot) {
  const safe = sanitizeStoreReadinessSnapshot(snapshot);
  return {
    kind: 'seller_store_readiness',
    version: 2,
    storeId: safe.storeId,
    generatedAt: safe.generatedAt,
    overallScore: safe.overallScore,
    status: safe.status,
    vertical: safe.vertical || null,
    sectionSummaries: Object.fromEntries(
      Object.entries(safe.sections || {}).map(([k, s]) => [
        k,
        {
          score: s.score,
          status: s.status,
          findingCount: s.findingCount,
          criticalCount: s.criticalCount,
          importantCount: s.importantCount,
        },
      ]),
    ),
    topFindings: (safe.findings || []).slice(0, 8).map((f) => ({
      code: f.code,
      severity: f.severity,
      category: f.category,
      title: f.title,
      reason: f.reason || f.explanation,
      recommendation: f.recommendation,
      evidence: f.evidence,
      affectedObject: f.affectedObject,
      destination: f.destination,
      destinationLabel: f.destinationLabel,
      estimatedImpactPercent: f.estimatedImpactPercent,
      estimatedEffortMinutes: f.estimatedEffortMinutes,
      pilCanAssist: f.pilCanAssist,
    })),
    topRecommendedActions: (safe.primaryActions || []).slice(0, 3).map((a) => ({
      id: a.id,
      findingCode: a.findingCode,
      group: a.group,
      title: a.title,
      explanation: a.explanation,
      recommendation: a.recommendation,
      actionType: a.actionType,
      destination: a.destination,
      destinationLabel: a.destinationLabel,
      destinationFilter: a.destinationFilter,
      affectedObject: a.affectedObject,
      estimatedImpactPercent: a.estimatedImpactPercent,
      estimatedEffortMinutes: a.estimatedEffortMinutes,
      impactLabel: a.impactLabel,
      pilCanAssist: a.pilCanAssist,
      pilCanExecute: false,
    })),
    counts: {
      mustFix: (safe.recommendedActions || []).filter((a) => a.group === 'must_fix').length,
      shouldImprove: (safe.recommendedActions || []).filter((a) => a.group === 'should_improve')
        .length,
      growth: (safe.recommendedActions || []).filter((a) => a.group === 'growth').length,
      findings: (safe.findings || []).length,
    },
    allowedAssistance: {
      navigate: true,
      generateContentDraft: true,
      suggestEdit: true,
      runValidation: true,
      requestApproval: true,
      changePrices: false,
      publishListings: false,
      activateCampaigns: false,
      deleteRecords: false,
      modifyPaymentSettings: false,
      enablePublicVisibility: false,
      applyDraftWithoutApproval: false,
    },
    grounding: {
      source: 'StoreReadinessSnapshot',
      allowsArbitraryDbQuery: false,
    },
  };
}

/**
 * @param {unknown} ctx
 */
export function isSellerPilContext(ctx) {
  return Boolean(ctx && typeof ctx === 'object' && ctx.kind === 'seller_store_readiness');
}
