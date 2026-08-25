/**
 * Learn step — persist mission outcomes for future agent context.
 *
 * Prefers Prisma BusinessLearning when available; falls back to JSON sidecar.
 * Never writes Business / BusinessSeed / User. Fire-and-forget via scheduleLearnStep.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPrismaClient } from '../prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');
const LEARNINGS_DIR = path.join(CORE_ROOT, 'data', 'orchestration', 'missionLearnings');

function inferCapabilityFromBrief(brief) {
  const lower = brief?.toLowerCase() ?? '';
  if (lower.includes('campaign') || lower.includes('promotion')) return 'campaign_creation';
  if (lower.includes('graphic') || lower.includes('image')) return 'graphic_generation';
  if (lower.includes('analytic') || lower.includes('report')) return 'analytics';
  if (lower.includes('video')) return 'video_generation';
  return 'general';
}

function inferIntentFromBrief(brief) {
  return inferCapabilityFromBrief(brief);
}

/**
 * @param {{
 *   missionId?: string,
 *   storeId?: string | null,
 *   brief?: string,
 *   verifyResult?: { passed?: boolean, score?: number, issues?: string[] },
 *   artifacts?: Array<{ type?: string }>,
 *   blackboard?: { appendEvent?: Function } | null,
 * }} context
 */
export async function runLearnStep(context = {}) {
  const storeId = context.storeId ? String(context.storeId).trim() : '';
  const missionId = String(context.missionId ?? '').trim() || 'unknown';
  const verifyResult = context.verifyResult ?? { passed: false, score: 0, issues: [] };
  const artifacts = Array.isArray(context.artifacts) ? context.artifacts : [];
  const brief = String(context.brief ?? '');

  const record = {
    missionId,
    storeId: storeId || null,
    briefSummary: brief.slice(0, 200),
    artifactTypes: artifacts.map((a) => a.type).filter(Boolean),
    verifyPassed: Boolean(verifyResult.passed),
    score: typeof verifyResult.score === 'number' ? verifyResult.score : 0,
    issues: Array.isArray(verifyResult.issues) ? verifyResult.issues : [],
    capability: inferCapabilityFromBrief(brief),
    intent: inferIntentFromBrief(brief),
    outcome: verifyResult.passed ? 'success' : 'partial',
    learnedAt: new Date().toISOString(),
  };

  // Prefer Prisma persistence when model + storeId exist.
  if (storeId) {
    try {
      const prisma = getPrismaClient();
      if (prisma?.businessLearning?.create) {
        await prisma.businessLearning.create({
          data: {
            storeId,
            missionId,
            capability: record.capability,
            outcome: record.outcome,
            score: record.score,
            briefSummary: record.briefSummary || null,
            issues: record.issues.length ? JSON.stringify(record.issues) : null,
          },
        });
      } else {
        throw new Error('businessLearning model unavailable');
      }
    } catch (err) {
      console.warn('[learnStep] Prisma persist failed, using sidecar:', err?.message ?? err);
      try {
        await fs.mkdir(LEARNINGS_DIR, { recursive: true });
        const file = path.join(LEARNINGS_DIR, `${missionId}.json`);
        await fs.writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
      } catch (sidecarErr) {
        console.warn('[learnStep] sidecar write failed (non-fatal):', sidecarErr?.message ?? sidecarErr);
      }
    }
  } else {
    try {
      await fs.mkdir(LEARNINGS_DIR, { recursive: true });
      const file = path.join(LEARNINGS_DIR, `${missionId}.json`);
      await fs.writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    } catch (err) {
      console.warn('[learnStep] sidecar write failed (non-fatal):', err?.message ?? err);
    }
  }

  if (context.blackboard?.appendEvent && missionId !== 'unknown') {
    try {
      await context.blackboard.appendEvent(missionId, 'learn_complete', {
        outcome: record.outcome,
        capability: record.capability,
        score: record.score,
      });
    } catch {
      // non-fatal
    }
  }

  return record;
}

/**
 * Schedule learn off the critical path.
 * @param {Parameters<typeof runLearnStep>[0]} context
 */
export function scheduleLearnStep(context) {
  setImmediate(() => {
    void runLearnStep(context).catch((err) => {
      console.warn('[learnStep] background failed:', err?.message ?? err);
    });
  });
}

/** Test helper — same API names as master prompt for spies. */
export const MissionLearningApi = {
  recordSuccessfulMission: async (payload) =>
    runLearnStep({
      ...payload,
      verifyResult: { passed: true, score: payload.score ?? 80, issues: [] },
    }),
  recordFailedMission: async (payload) =>
    runLearnStep({
      ...payload,
      verifyResult: {
        passed: false,
        score: payload.score ?? 20,
        issues: payload.issues ?? ['failed'],
      },
    }),
};
