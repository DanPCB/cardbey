/**
 * Business quality scoring engine (Phase 4).
 * Output: 0–100 score and high/medium/low classification.
 */

import type { NormalizedBusinessRecord, QualityAssessment, QualityTier, ResolutionStatus } from './types.js';

function tierFromScore(score: number): QualityTier {
  if (score >= 75) return 'high_quality';
  if (score >= 45) return 'medium_quality';
  return 'low_quality';
}

export class BusinessQualityScorer {
  score(
    record: NormalizedBusinessRecord,
    resolution: ResolutionStatus = 'unique',
  ): QualityAssessment {
    const factors: Record<string, number> = {};

    factors.websitePresent = record.website ? 20 : 0;
    factors.phonePresent = record.phone ? 20 : 0;

    let addressScore = 0;
    if (record.address) {
      addressScore += 10;
      if (record.city) addressScore += 5;
      if (record.state) addressScore += 5;
      if (record.country) addressScore += 5;
    }
    factors.addressCompleteness = addressScore;

    factors.categoryConfidence = Math.round(record.categoryConfidence * 15);
    factors.confidenceScore = Math.round(record.confidenceScore * 15);

    if (record.email) factors.emailPresent = 5;
    if (record.registrationNumber) factors.registrationPresent = 5;
    if (record.businessName) factors.namePresent = 5;

    if (resolution === 'duplicate') {
      factors.duplicatePenalty = -100;
    } else if (resolution === 'possible_duplicate') {
      factors.duplicateConfidence = -15;
    } else {
      factors.duplicateConfidence = 10;
    }

    const raw = Object.values(factors).reduce((a, b) => a + b, 0);
    const qualityScore = Math.max(0, Math.min(100, raw));

    return {
      qualityScore,
      tier: tierFromScore(qualityScore),
      factors,
    };
  }
}

export const businessQualityScorer = new BusinessQualityScorer();
