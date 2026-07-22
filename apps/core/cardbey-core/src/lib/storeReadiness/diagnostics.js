/**
 * Development-only readiness diagnostics (Phase 2).
 */

import { STORE_READINESS_RULE_CODES } from './rules.js';
import { resolveBusinessVertical } from './verticalRules.js';

/** Approximate rules evaluated per section (base + vertical). */
const SECTION_RULE_BUDGET = {
  businessProfile: 8,
  branding: 6,
  catalog: 12,
  storefront: 5,
  contactAndLocation: 3,
  commerce: 5,
  marketing: 3,
  trustAndCompliance: 2,
};

/**
 * @param {import('./types.js').StoreReadinessSnapshot} snapshot
 * @param {{ storeInput?: object, enabled?: boolean }} [opts]
 */
export function buildReadinessDiagnostics(snapshot, opts = {}) {
  const enabled =
    opts.enabled === true ||
    process.env.NODE_ENV === 'development' ||
    process.env.STORE_READINESS_DIAGNOSTICS === '1';
  if (!enabled) return null;

  const findings = snapshot.findings || [];
  const vertical = resolveBusinessVertical(
    opts.storeInput?.type || opts.storeInput?.category || opts.storeInput?.vertical,
  );

  const sections = Object.entries(snapshot.sections || {}).map(([key, s]) => {
    const sectionFindings = findings.filter((f) => f.category === key);
    const failed = sectionFindings.length;
    const budget = SECTION_RULE_BUDGET[key] || 4;
    const passed = Math.max(0, budget - failed);
    return {
      section: key,
      score: s.score,
      findingCount: s.findingCount,
      rulesEvaluated: budget,
      rulesPassed: passed,
      rulesFailed: failed,
      findingCodes: sectionFindings.map((f) => f.code),
    };
  });

  return {
    kind: 'store_readiness_diagnostics',
    developmentOnly: true,
    storeId: snapshot.storeId,
    overallScore: snapshot.overallScore,
    status: snapshot.status,
    vertical,
    registrySize: STORE_READINESS_RULE_CODES.length,
    sections,
    generatedAt: snapshot.generatedAt,
  };
}
