/**
 * Adaptive pattern weights — governed adjustments from approved proposals only.
 * In-memory cache (no Redis dependency in dev/test).
 */
import { getPrismaClient } from '../prisma.js';

const CACHE_TTL_MS = 60 * 60 * 1000;

/** @type {Map<string, { weight: number, expiresAt: number }>} */
const weightCache = new Map();

function readHistory(raw) {
  if (Array.isArray(raw)) return raw;
  return [];
}

export class AdaptiveWeightService {
  /** @type {AdaptiveWeightService | null} */
  static instance = null;

  static getInstance() {
    if (!AdaptiveWeightService.instance) {
      AdaptiveWeightService.instance = new AdaptiveWeightService();
    }
    return AdaptiveWeightService.instance;
  }

  /** @param {string} patternId */
  async getWeight(patternId) {
    const key = String(patternId ?? '').trim();
    if (!key) return 1.0;

    const cached = weightCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.weight;
    }

    const prisma = getPrismaClient();
    const record = await prisma.patternWeight.findUnique({ where: { patternId: key } });
    const weight = record?.weight ?? 1.0;

    weightCache.set(key, { weight, expiresAt: Date.now() + CACHE_TTL_MS });
    return weight;
  }

  /**
   * @param {string} patternId
   * @param {number} adjustment
   * @param {string} reason
   * @param {Record<string, unknown>} [metadata]
   */
  async adjustWeight(patternId, adjustment, reason, metadata = {}) {
    const key = String(patternId ?? '').trim();
    if (!key) throw new Error('patternId required');

    const currentWeight = await this.getWeight(key);
    const delta = Number(adjustment);
    if (!Number.isFinite(delta)) throw new Error('adjustment must be a number');

    const newWeight = Math.max(0.1, Math.min(2.0, currentWeight + delta));
    const [intent, matchedSkill] = key.includes(':') ? key.split(':', 2) : [key, key];

    const entry = {
      adjustment: delta,
      reason,
      metadata,
      timestamp: new Date().toISOString(),
      previousWeight: currentWeight,
      newWeight,
    };

    const prisma = getPrismaClient();
    const existing = await prisma.patternWeight.findUnique({ where: { patternId: key } });
    const history = readHistory(existing?.adjustmentHistory);
    history.push(entry);

    await prisma.patternWeight.upsert({
      where: { patternId: key },
      update: {
        weight: newWeight,
        lastAdjusted: new Date(),
        adjustmentHistory: history,
      },
      create: {
        patternId: key,
        intent,
        matchedSkill: matchedSkill || intent,
        weight: newWeight,
        adjustmentHistory: [entry],
      },
    });

    weightCache.delete(key);

    console.log(
      `[AdaptiveWeight] ${key}: ${currentWeight} → ${newWeight} (${delta > 0 ? '+' : ''}${delta}) - ${reason}`,
    );

    return newWeight;
  }

  async batchAdjustFromProposals() {
    const prisma = getPrismaClient();
    const proposals = await prisma.selfHealingProposal.findMany({
      where: {
        type: 'intent_pattern_adjustment',
        status: 'approved',
        appliedAt: null,
      },
    });

    let applied = 0;
    for (const proposal of proposals) {
      const fix =
        proposal.suggestedFix && typeof proposal.suggestedFix === 'object'
          ? proposal.suggestedFix
          : {};
      const intent = String(fix.intent ?? proposal.metadata?.intent ?? '').trim();
      const matchedSkill = String(
        fix.currentSkill ?? proposal.metadata?.matchedSkill ?? intent,
      ).trim();
      const adjustment = Number(fix.adjustment ?? 0);
      if (!intent || !Number.isFinite(adjustment) || adjustment === 0) continue;

      const patternId = `${intent}:${matchedSkill}`;
      await this.adjustWeight(patternId, adjustment, `Approved proposal: ${proposal.id}`, {
        proposalId: proposal.id,
        intent,
        matchedSkill,
      });

      await prisma.selfHealingProposal.update({
        where: { id: proposal.id },
        data: { appliedAt: new Date(), status: 'applied' },
      });
      applied += 1;
    }

    return { applied };
  }

  /** Test helper */
  static resetCacheForTests() {
    weightCache.clear();
    AdaptiveWeightService.instance = null;
  }
}

export function getAdaptiveWeightService() {
  return AdaptiveWeightService.getInstance();
}
