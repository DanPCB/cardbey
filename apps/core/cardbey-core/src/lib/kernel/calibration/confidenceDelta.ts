/**
 * Phase 3 — confidence delta between Performer and Kernel top alternative.
 */

import type { ConfidenceDeltaResult } from './decisionRecord.types.js';

export function calculateConfidenceDelta(args: {
  performerConfidence?: number | null;
  kernelTopScore?: number | null;
}): ConfidenceDeltaResult {
  const performerConfidence =
    args.performerConfidence != null && Number.isFinite(Number(args.performerConfidence))
      ? Number(args.performerConfidence)
      : null;
  const kernelTopScore =
    args.kernelTopScore != null && Number.isFinite(Number(args.kernelTopScore))
      ? Number(args.kernelTopScore)
      : null;

  if (performerConfidence == null && kernelTopScore == null) {
    return {
      performerConfidence: null,
      kernelTopScore: null,
      delta: null,
      strongerSide: 'unknown',
    };
  }

  if (performerConfidence == null) {
    return {
      performerConfidence: null,
      kernelTopScore,
      delta: null,
      strongerSide: 'kernel',
    };
  }

  if (kernelTopScore == null) {
    return {
      performerConfidence,
      kernelTopScore: null,
      delta: null,
      strongerSide: 'performer',
    };
  }

  const delta = Math.round((performerConfidence - kernelTopScore) * 1000) / 1000;
  let strongerSide: ConfidenceDeltaResult['strongerSide'] = 'equal';
  if (Math.abs(delta) < 0.001) strongerSide = 'equal';
  else if (delta > 0) strongerSide = 'performer';
  else strongerSide = 'kernel';

  return { performerConfidence, kernelTopScore, delta, strongerSide };
}
