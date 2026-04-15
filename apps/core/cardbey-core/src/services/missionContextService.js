/**
 * MissionContext persistence — contextJson / snapshotsJson / outcomeJson stored as TEXT (JSON strings) for SQLite.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { enrichDomainContext } from './domainContextEnricher.js';
import { buildHypothesis } from './hypothesisEngine.js';
import { scoreAlignment } from './snapshotAlignmentScorer.js';
import { analyzeMissionOutcome } from './outcomeAnalyzer.js';
import { writeFeedbackVectors } from './ragFeedbackWriter.js';

function parseContextJson(str) {
  try {
    const v = JSON.parse(str ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function parseSnapshotsJson(str) {
  try {
    const v = JSON.parse(str ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} [initialContext]
 */
export async function createMissionContext(missionId, initialContext = {}) {
  const prisma = getPrismaClient();
  const base = initialContext && typeof initialContext === 'object' && !Array.isArray(initialContext) ? initialContext : {};
  return prisma.missionContext.create({
    data: {
      missionId,
      contextJson: JSON.stringify(base),
      snapshotsJson: JSON.stringify([]),
    },
  });
}

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} patch
 */
export async function enrichMissionContext(missionId, patch) {
  const prisma = getPrismaClient();
  const existing = await prisma.missionContext.findUnique({ where: { missionId } });
  if (!existing) return null;
  const ctx = parseContextJson(existing.contextJson);
  const p = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const merged = { ...ctx, ...p };
  return prisma.missionContext.update({
    where: { missionId },
    data: { contextJson: JSON.stringify(merged) },
  });
}

/**
 * @param {string} missionId
 * @param {string} stepKey
 * @param {Record<string, unknown>} [snapshot]
 */
export async function snapshotMissionStep(missionId, stepKey, snapshot = {}) {
  const prisma = getPrismaClient();
  const existing = await prisma.missionContext.findUnique({ where: { missionId } });
  if (!existing) return null;
  const snapshots = parseSnapshotsJson(existing.snapshotsJson);
  const base = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
  const existingContext = JSON.parse(existing.contextJson ?? '{}');
  const hypothesis = existingContext.hypothesis ?? null;
  const alignmentResult = await scoreAlignment(
    hypothesis,
    stepKey,
    base.inputState ?? {},
    base.outputState ?? {}
  ).catch(() => ({ hypothesisAlignment: 0.5, deviation: null, scoredBy: 'error' }));
  const enrichedSnapshot = {
    ...base,
    stepKey: stepKey != null && String(stepKey).trim() !== '' ? String(stepKey) : 'unknown',
    timestamp: base.timestamp ?? new Date().toISOString(),
    hypothesisAlignment: alignmentResult.hypothesisAlignment,
    deviation: alignmentResult.deviation,
    scoredBy: alignmentResult.scoredBy,
  };
  snapshots.push(enrichedSnapshot);
  return prisma.missionContext.update({
    where: { missionId },
    data: { snapshotsJson: JSON.stringify(snapshots) },
  });
}

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} outcome
 */
export async function closeMissionContext(missionId, outcome) {
  const prisma = getPrismaClient();
  const existing = await prisma.missionContext.findUnique({ where: { missionId } });
  if (!existing) return null;
  const o = outcome && typeof outcome === 'object' && !Array.isArray(outcome) ? outcome : {};
  const updated = await prisma.missionContext.update({
    where: { missionId },
    data: { outcomeJson: JSON.stringify(o) },
  });

  // Fire-and-forget RAG feedback write
  analyzeMissionOutcome(missionId)
    .then((vectors) => {
      if (vectors.length > 0) {
        return writeFeedbackVectors(vectors);
      }
    })
    .then((result) => {
      if (result) {
        console.log('[EFL] Feedback written:', result);
      }
    })
    .catch((err) => {
      console.error('[EFL] Feedback write failed:', err?.message);
    });

  return updated;
}

/**
 * Enrich domain + LLM hypothesis, merge into MissionContext.contextJson.
 * @param {string} missionId
 * @param {string} rawIntent
 * @param {string} storeId - Business id
 * @returns {Promise<import('@prisma/client').MissionContext | null>}
 */
export async function buildAndStoreMissionHypothesis(missionId, rawIntent, storeId) {
  try {
    const prisma = getPrismaClient();
    const domainContext = await enrichDomainContext(storeId);
    const hypothesis = await buildHypothesis(missionId, rawIntent, domainContext);
    const existing = await prisma.missionContext.findUnique({ where: { missionId } });
    if (!existing) return null;
    const existingContext = parseContextJson(existing.contextJson);
    const merged = { ...existingContext, hypothesis, domainContext };
    return await prisma.missionContext.update({
      where: { missionId },
      data: { contextJson: JSON.stringify(merged) },
    });
  } catch {
    return null;
  }
}

async function checkAndCorrectCourse(missionId) {
  try {
    const prisma = getPrismaClient();
    const record = await prisma.missionContext.findUnique({ where: { missionId } });
    if (!record) return null;

    const existingContext = parseContextJson(record.contextJson);
    const snapshots = parseSnapshotsJson(record.snapshotsJson);

    const lowAlignmentSnapshot = [...snapshots]
      .reverse()
      .find(
        (s) =>
          typeof s.hypothesisAlignment === 'number' && s.hypothesisAlignment < 0.4
      );

    if (!lowAlignmentSnapshot) {
      return { correctionNeeded: false, missionId };
    }

    const ctxForHypothesis = JSON.parse(record.contextJson ?? '{}');
    const revisedHypothesis = await buildHypothesis(
      missionId,
      ctxForHypothesis.rawIntent ?? 'unknown',
      ctxForHypothesis.domainContext ?? null
    ).catch(() => null);

    if (revisedHypothesis == null) {
      return { correctionNeeded: false, missionId };
    }

    revisedHypothesis.revisedAt = new Date().toISOString();
    revisedHypothesis.revisionReason =
      lowAlignmentSnapshot.deviation ?? 'low alignment';

    const previousConfidence = existingContext.hypothesis?.confidenceScore ?? null;
    const newConfidence = revisedHypothesis.confidenceScore ?? null;

    await prisma.missionContext.update({
      where: { missionId },
      data: {
        contextJson: JSON.stringify({
          ...existingContext,
          hypothesis: revisedHypothesis,
        }),
      },
    });

    return {
      correctionNeeded: true,
      missionId,
      previousConfidence,
      newConfidence,
      revisionReason: lowAlignmentSnapshot.deviation,
    };
  } catch {
    return null;
  }
}

export { checkAndCorrectCourse };
