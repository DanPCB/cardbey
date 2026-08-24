/**
 * Mission 001 Gates 5–6 — pre-reveal fidelity assessment + targeted repair planning.
 */

import { computeBusinessFidelityScore } from '../performerGrounding/businessFidelityScore.js';
import { validateStoreCoherence } from '../../services/draftStore/storeCoherenceValidator.js';
import Mission001Flags from './mission001Flags.js';

export const FIDELITY_FAILURE_CLASS = Object.freeze({
  CRITICAL: 'CRITICAL',
  REPAIRABLE: 'REPAIRABLE',
  ACCEPTABLE: 'ACCEPTABLE',
});

const MAX_REPAIR_CYCLES = 2;

/**
 * @param {object} preview
 * @param {object} [options]
 */
export function assessPreRevealFidelity(preview, options = {}) {
  const ctx = options.ctx ?? preview?.meta?.storeGenerationBusinessContext ?? null;
  const coherence = validateStoreCoherence(preview, ctx);
  const fidelity =
    options.fidelityScore ??
    options.groundedResult?.fidelity ??
    (options.evidence
      ? computeBusinessFidelityScore({
          evidence: options.evidence,
          catalogDraft: options.catalogDraft ?? options.groundedResult?.catalogDraft,
        })
      : preview?.meta?.mission001?.fidelityScore ?? null);

  /** @type {Array<{ dimension: string, severity: string, message: string }>} */
  const failures = [];

  for (const msg of coherence.critical ?? []) {
    failures.push({
      dimension: classifyCoherenceMessage(msg),
      severity: FIDELITY_FAILURE_CLASS.CRITICAL,
      message: msg,
    });
  }
  for (const msg of coherence.warnings ?? []) {
    failures.push({
      dimension: classifyCoherenceMessage(msg),
      severity: FIDELITY_FAILURE_CLASS.REPAIRABLE,
      message: msg,
    });
  }

  if (fidelity) {
    if (fidelity.identity < 50) {
      failures.push({
        dimension: 'identity',
        severity: FIDELITY_FAILURE_CLASS.CRITICAL,
        message: 'low_identity_confidence',
      });
    }
    if (fidelity.catalog < 40) {
      failures.push({
        dimension: 'catalog',
        severity: FIDELITY_FAILURE_CLASS.CRITICAL,
        message: 'low_catalog_fidelity',
      });
    }
    if (fidelity.media < 45) {
      failures.push({
        dimension: 'images',
        severity: FIDELITY_FAILURE_CLASS.REPAIRABLE,
        message: 'weak_image_fidelity',
      });
    }
    if (fidelity.branding < 50) {
      failures.push({
        dimension: 'composition',
        severity: FIDELITY_FAILURE_CLASS.REPAIRABLE,
        message: 'weak_composition_fidelity',
      });
    }
    for (const blocker of fidelity.blockers ?? []) {
      if (blocker === 'high_fallback_ratio') {
        failures.push({
          dimension: 'grounding',
          severity: FIDELITY_FAILURE_CLASS.CRITICAL,
          message: blocker,
        });
      }
    }
  }

  const repairTargets = selectRepairTargets(failures, fidelity);
  const hasCritical = failures.some((f) => f.severity === FIDELITY_FAILURE_CLASS.CRITICAL);

  return {
    enabled: Mission001Flags.fidelityPreReveal,
    fidelity,
    coherence,
    failures,
    repairTargets,
    hasCritical,
    maxRepairCycles: MAX_REPAIR_CYCLES,
    pass: !hasCritical,
  };
}

function classifyCoherenceMessage(msg) {
  const m = String(msg).toLowerCase();
  if (m.includes('scaffold') || m.includes('core service')) return 'catalog';
  if (m.includes('review') || m.includes('social-proof')) return 'grounding';
  if (m.includes('image')) return 'images';
  if (m.includes('cta') || m.includes('shows')) return 'composition';
  return 'coherence';
}

/**
 * @param {Array<{ dimension: string, severity: string }>} failures
 * @param {object | null} fidelity
 */
export function selectRepairTargets(failures, fidelity = null) {
  const targets = new Set();
  for (const f of failures) {
    if (f.severity === FIDELITY_FAILURE_CLASS.CRITICAL && f.dimension === 'identity') {
      targets.add('identity');
    }
    if (f.dimension === 'catalog' && (f.severity === FIDELITY_FAILURE_CLASS.CRITICAL || (fidelity?.catalog ?? 100) < 50)) {
      targets.add('catalog');
    }
    if (f.dimension === 'images' || (fidelity?.media ?? 100) < 45) {
      targets.add('images');
    }
    if (f.dimension === 'composition' || (fidelity?.branding ?? 100) < 50) {
      targets.add('composition');
    }
  }
  return [...targets];
}

/**
 * Bounded repair planner — does not execute repairs (caller runs targeted steps).
 * @param {object} assessment
 * @param {number} cycle
 */
export function planTargetedRepair(assessment, cycle = 0) {
  if (!Mission001Flags.targetedRepair) return { shouldRepair: false, targets: [], cycle };
  if (cycle >= MAX_REPAIR_CYCLES) return { shouldRepair: false, targets: [], cycle, exhausted: true };
  if (!assessment?.repairTargets?.length) return { shouldRepair: false, targets: [], cycle };
  if (assessment.hasCritical && assessment.repairTargets.includes('identity')) {
    return { shouldRepair: false, targets: ['identity'], cycle, blocked: true };
  }
  return { shouldRepair: true, targets: assessment.repairTargets, cycle: cycle + 1 };
}

/**
 * Gate 7 helper — enrich generic image query with business context.
 * @param {string} baseQuery
 * @param {object} ctx
 */
export function enrichImageQueryWithBusinessContext(baseQuery, ctx = {}) {
  if (!Mission001Flags.imageFidelity) return baseQuery;
  const q = String(baseQuery ?? '').trim();
  if (!q || q.length > 60) return q;
  const parts = [q];
  const biz = String(ctx.businessName ?? ctx.storeName ?? '').trim();
  const loc = String(ctx.location ?? ctx.address ?? '').trim();
  const cat = String(ctx.businessType ?? ctx.category ?? ctx.storeType ?? '').trim();
  if (cat && !q.toLowerCase().includes(cat.toLowerCase().slice(0, 8))) parts.push(cat);
  if (loc) {
    const city = loc.split(',')[0]?.trim();
    if (city && !q.toLowerCase().includes(city.toLowerCase())) parts.push(city);
  }
  if (biz && q.length < 12 && !q.toLowerCase().includes('business')) {
    parts.push('business');
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
