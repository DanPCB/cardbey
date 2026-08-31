/**
 * Mission 001 Gate 9 — skip optional checkpoints when inference is confident.
 */

import Mission001Flags from './mission001Flags.js';

/**
 * @param {object} catalogResult
 */
export function shouldSkipResearchReviewCheckpoint(catalogResult = {}) {
  if (!Mission001Flags.reduceFriction) return false;

  const research = catalogResult.research;
  if (!research?.researchRan || research.fallbackToGenerated) return false;
  if (research.ownerConfirmed === true) return true;

  const mission001 = catalogResult.mission001 ?? {};
  if (mission001.sparseMode === true) return false;

  const nameResolution = mission001.nameResolution;
  if (nameResolution?.sparseMode === true) return false;
  if (nameResolution?.resolution?.requiresOwnerConfirmation === true) return false;
  if ((nameResolution?.resolution?.candidates?.length ?? 0) > 1) return false;

  const confidence = Number(research.confidence) || 0;
  const fidelityOverall = Number(mission001.fidelityScore?.overall) || 0;

  if (confidence >= 0.82 && fidelityOverall >= 70) return true;
  if (confidence >= 0.9 && research.ownerReviewRequired !== true) return true;
  return false;
}

/**
 * @param {object} catalogResult
 */
export function frictionReductionSummary(catalogResult = {}) {
  return {
    enabled: Mission001Flags.reduceFriction,
    skipResearchReview: shouldSkipResearchReviewCheckpoint(catalogResult),
  };
}
