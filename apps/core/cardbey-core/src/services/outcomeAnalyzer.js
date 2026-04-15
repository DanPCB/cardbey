/**
 * Analyzes a completed mission and extracts feedback vectors for RAG (no LLM).
 */

import { getPrismaClient } from '../lib/prisma.js';

export async function analyzeMissionOutcome(missionId) {
  try {
    const prisma = getPrismaClient();
    const record = await prisma.missionContext.findUnique({
      where: { missionId },
    });
    if (!record) return [];

    const contextJson = JSON.parse(record.contextJson ?? '{}');
    const snapshotsJson = JSON.parse(record.snapshotsJson ?? '[]');
    const outcomeJson = record.outcomeJson ? JSON.parse(record.outcomeJson) : null;

    const hypothesis = contextJson.hypothesis ?? null;
    const domainContext = contextJson.domainContext ?? null;
    const storeType = domainContext?.storeProfile?.storeType ?? 'unknown';
    const canonicalIntent = contextJson.canonicalIntent ?? 'unknown';
    const success = outcomeJson?.success ?? false;

    const feedbackVectors = [];

    for (const snapshot of snapshotsJson) {
      const alignment = snapshot.hypothesisAlignment ?? 0.5;
      const stepKey = snapshot.stepKey ?? 'unknown';

      if (alignment >= 0.8 && success) {
        feedbackVectors.push({
          type: 'success_pattern',
          query: `${storeType} store ${canonicalIntent} ${stepKey}`,
          observation: `Step ${stepKey} succeeded with alignment ${alignment.toFixed(2)}. Output had: ${Object.keys(snapshot.outputState ?? {}).join(', ')}`,
          context: { storeType, canonicalIntent, stepKey, alignment, success },
          weight: alignment,
          missionId,
          createdAt: new Date().toISOString(),
        });
      }

      if (alignment < 0.4) {
        feedbackVectors.push({
          type: 'failure_pattern',
          query: `${storeType} store ${canonicalIntent} ${stepKey} failure`,
          observation: snapshot.deviation ?? `Step ${stepKey} had low alignment ${alignment.toFixed(2)}`,
          context: { storeType, canonicalIntent, stepKey, alignment, success },
          weight: 1 - alignment,
          missionId,
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (hypothesis) {
      const avgAlignment =
        snapshotsJson.length > 0
          ? snapshotsJson.reduce(
              (sum, s) => sum + (s.hypothesisAlignment ?? 0.5),
              0
            ) / snapshotsJson.length
          : 0.5;

      feedbackVectors.push({
        type: 'hypothesis_accuracy',
        query: `${storeType} store ${canonicalIntent} hypothesis accuracy`,
        observation: `Hypothesis confidence was ${hypothesis.confidenceScore}, actual avg alignment was ${avgAlignment.toFixed(2)}. Mission ${success ? 'succeeded' : 'failed'}.`,
        context: {
          storeType,
          canonicalIntent,
          hypothesisConfidence: hypothesis.confidenceScore,
          actualAvgAlignment: avgAlignment,
          success,
          planningHintsCount: hypothesis.planningHints?.length ?? 0,
        },
        weight: success ? avgAlignment : 0.3,
        missionId,
        createdAt: new Date().toISOString(),
      });
    }

    return feedbackVectors;
  } catch (err) {
    console.error('[OutcomeAnalyzer] error:', err?.message);
    return [];
  }
}
