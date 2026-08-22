/**
 * Prioritization + impact (Phase 2).
 */

import { severityWeight } from './findings.js';
import { impactForFindingCode } from './impact.js';

const JOURNEY_CODES = new Set([
  'STOREFRONT_HIDDEN',
  'STOREFRONT_BLOCKING_MEDIA',
  'BRANDING_HERO_VIDEO_NOT_PLAYABLE',
  'CATALOG_EMPTY',
  'CATALOG_NO_ACTIVE_ITEMS',
  'COMMERCE_MISSING_PATH',
  'STOREFRONT_MISSING_CTA',
  'STOREFRONT_INVALID_CTA',
  'VERTICAL_SERVICE_QUOTE_PATH',
  'VERTICAL_CREATOR_FEATURED_WORK',
]);

const CATALOG_ESSENTIAL = new Set([
  'CATALOG_MISSING_NAME',
  'CATALOG_MISSING_PRICE',
  'CATALOG_INVALID_SERVICE_TIERS',
  'VERTICAL_RETAIL_PRICING',
  'VERTICAL_SERVICE_DESCRIPTIONS',
]);

/**
 * @param {import('./types.js').StoreReadinessFinding} f
 * @returns {'must_fix'|'should_improve'|'growth'}
 */
export function groupForFinding(f) {
  if (f.severity === 'critical') return 'must_fix';
  if (f.severity === 'important') return 'must_fix';
  if (f.severity === 'optional') return 'growth';
  return 'should_improve';
}

/**
 * @param {import('./types.js').StoreReadinessFinding} f
 */
export function priorityScore(f) {
  let score = severityWeight(f.severity);
  if (JOURNEY_CODES.has(f.code)) score += 40;
  if (CATALOG_ESSENTIAL.has(f.code)) score += 25;
  if (f.code === 'BRANDING_HERO_VIDEO_NOT_PLAYABLE') score += 15;
  if (f.category === 'marketing') score -= 5;
  const impact = f.estimatedImpactPercent ?? impactForFindingCode(f.code).estimatedImpactPercent;
  score += Math.min(20, Number(impact) || 0);
  return score;
}

/**
 * @param {import('./types.js').StoreReadinessFinding[]} findings
 * @param {{ maxPrimary?: number }} [opts]
 */
export function prioritizeFindings(findings, opts = {}) {
  const maxPrimary = opts.maxPrimary ?? 3;
  const sorted = [...findings].sort((a, b) => {
    const d = priorityScore(b) - priorityScore(a);
    if (d !== 0) return d;
    const ia = a.estimatedImpactPercent ?? 0;
    const ib = b.estimatedImpactPercent ?? 0;
    if (ib !== ia) return ib - ia;
    return String(a.code).localeCompare(String(b.code));
  });

  const recommendedActions = sorted.map((f, index) => {
    const impact = impactForFindingCode(f.code);
    return {
      id: `action_${f.code}_${index}`,
      findingCode: f.code,
      group: groupForFinding(f),
      title: f.title,
      explanation: f.reason || f.explanation,
      recommendation: f.recommendation,
      evidence: f.evidence,
      actionType: f.recommendedActionType,
      destination: f.destination,
      destinationKey: f.destinationKey || null,
      destinationLabel: f.destinationLabel || null,
      destinationFilter: f.destinationFilter || null,
      affectedObject: f.affectedObject,
      pilCanAssist: f.pilCanAssist,
      pilCanExecute: false,
      priority: priorityScore(f),
      estimatedImpactPercent: f.estimatedImpactPercent ?? impact.estimatedImpactPercent,
      estimatedEffortMinutes: f.estimatedEffortMinutes ?? impact.estimatedEffortMinutes,
      impactLabel: f.impactLabel || impact.impactLabel,
    };
  });

  const primaryActions = recommendedActions.slice(0, maxPrimary);
  return { recommendedActions, primaryActions };
}

/**
 * @param {import('./types.js').StoreReadinessFinding[]} findings
 * @param {Record<string, import('./types.js').ReadinessSection>} sections
 */
export function computeOverallScore(findings, sections) {
  const keys = Object.keys(sections);
  if (!keys.length) return 0;
  const sum = keys.reduce((acc, k) => acc + (sections[k]?.score ?? 0), 0);
  return Math.round(sum / keys.length);
}

/**
 * @param {number} overallScore
 * @param {import('./types.js').StoreReadinessFinding[]} findings
 * @param {{ isLive?: boolean }} meta
 */
export function computeStatus(overallScore, findings, meta = {}) {
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const important = findings.filter((f) => f.severity === 'important').length;
  const total = findings.length;

  if (meta.isLive && (critical > 0 || important > 0)) {
    return 'live_needs_attention';
  }
  if (total === 0 && overallScore >= 95) return 'ready';
  if (overallScore >= 85 && critical === 0 && important <= 1) return 'nearly_ready';
  if (overallScore >= 85 && critical === 0 && important === 0) return 'ready';
  if (total === 0) return 'ready';
  if (overallScore < 25 && critical >= 2) return 'not_started';
  return 'in_progress';
}
