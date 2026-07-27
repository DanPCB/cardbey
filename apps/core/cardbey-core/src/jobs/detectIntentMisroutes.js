/**
 * PIL learning Phase 3 — batch misroute detection from dispatch feedback.
 * Creates governed proposals only; never auto-applies pattern changes.
 */
import { getPrismaClient } from '../lib/prisma.js';
import { createProposal } from '../services/selfHealing/createProposal.js';

const MIN_GROUP_SIZE = 4; // >3 occurrences

/**
 * @typedef {object} MisrouteGroup
 * @property {string} intent
 * @property {string} matchedSkill
 * @property {number} total
 * @property {number} avgRating
 * @property {number} corrections
 * @property {string[]} exampleCorrections
 */

/**
 * Aggregate negative feedback grouped by intent + matchedSkill.
 * @returns {Promise<MisrouteGroup[]>}
 */
export async function aggregateMisrouteGroups() {
  const prisma = getPrismaClient();

  const feedbackRows = await prisma.skillDispatchFeedback.findMany({
    where: {
      OR: [{ rating: { lt: 3 } }, { correctionText: { not: null } }],
    },
    include: {
      dispatchLog: {
        select: {
          intent: true,
          matchedSkill: true,
        },
      },
    },
  });

  /** @type {Map<string, MisrouteGroup & { ratingSum: number }>} */
  const groups = new Map();

  for (const row of feedbackRows) {
    const log = row.dispatchLog;
    if (!log?.intent) continue;

    const matchedSkill = log.matchedSkill ?? 'unknown';
    const key = `${log.intent}::${matchedSkill}`;
    const prev = groups.get(key) ?? {
      intent: log.intent,
      matchedSkill,
      total: 0,
      avgRating: 0,
      corrections: 0,
      exampleCorrections: [],
      ratingSum: 0,
    };

    prev.total += 1;
    prev.ratingSum += row.rating;
    if (row.correctionText?.trim()) {
      prev.corrections += 1;
      if (prev.exampleCorrections.length < 5) {
        prev.exampleCorrections.push(row.correctionText.trim());
      }
    }

    groups.set(key, prev);
  }

  return [...groups.values()]
    .filter((g) => g.total > MIN_GROUP_SIZE - 1)
    .map((g) => ({
      intent: g.intent,
      matchedSkill: g.matchedSkill,
      total: g.total,
      avgRating: g.total > 0 ? g.ratingSum / g.total : 0,
      corrections: g.corrections,
      exampleCorrections: g.exampleCorrections,
    }))
    .sort((a, b) => b.corrections - a.corrections || a.avgRating - b.avgRating);
}

/**
 * @param {MisrouteGroup} misroute
 */
function computeAdjustment(misroute) {
  if (misroute.avgRating < 2.5) {
    return { adjustment: -0.3, severity: 'medium' };
  }
  if (misroute.corrections > 2) {
    return { adjustment: -0.2, severity: 'low' };
  }
  if (misroute.avgRating > 4) {
    return { adjustment: 0.1, severity: 'low' };
  }
  return { adjustment: 0, severity: 'low' };
}

/**
 * Scan feedback, detect misroutes, create governed proposals.
 * @returns {Promise<{ processed: number, proposals: number }>}
 */
export async function detectIntentMisroutes() {
  const misroutes = await aggregateMisrouteGroups();
  let proposalCount = 0;

  for (const misroute of misroutes) {
    const { adjustment, severity } = computeAdjustment(misroute);
    if (adjustment === 0) continue;

    await createProposal({
      type: 'intent_pattern_adjustment',
      title: `Adjust pattern weights for "${misroute.intent}"`,
      description: `Intent "${misroute.intent}" routed to "${misroute.matchedSkill}" ${misroute.total} times with avg rating ${misroute.avgRating.toFixed(1)} and ${misroute.corrections} corrections.`,
      suggestedFix: {
        file: 'src/lib/skill_runtime/patterns.ts',
        intent: misroute.intent,
        currentSkill: misroute.matchedSkill,
        adjustment,
        newWeight: adjustment > 0 ? 'increase' : 'decrease',
        severity,
      },
      metadata: {
        intent: misroute.intent,
        matchedSkill: misroute.matchedSkill,
        total: misroute.total,
        avgRating: misroute.avgRating,
        corrections: misroute.corrections,
        exampleCorrections: misroute.exampleCorrections.slice(0, 3),
      },
      autoCreateProposal: Math.abs(adjustment) >= 0.2,
      requiresConfirmation: true,
    });

    proposalCount += 1;
  }

  return { processed: misroutes.length, proposals: proposalCount };
}
