/**
 * Candidate Intelligence Brief — evidence-backed BI for discovered businesses.
 */

export type BriefStatus =
  | 'draft'
  | 'ready'
  | 'downloaded'
  | 'claim_started'
  | 'claimed'
  | 'rolled_back'
  | 'archived';

export interface VisibilityScores {
  overall: number;
  seoReadiness: number;
  geoReadiness: number;
  onlinePresence: number;
  profileCompleteness: number;
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
}

export interface VisibilityEstimate {
  seoReadiness: { current: number; estimatedAfterClaim: number };
  geoReadiness: { current: number; estimatedAfterClaim: number };
  profileCompleteness: { current: number; estimatedAfterClaim: number };
  overall: { current: number; estimatedAfterClaim: number };
  overallReadiness: { current: number; estimatedAfterClaim: number };
  disclaimer: string;
}

import type { BusinessHealthScore } from './businessHealthScore.js';

export type { BusinessHealthScore, HealthPillar, HealthSubMetric } from './businessHealthScore.js';

export interface CandidateIntelligenceBrief {
  id: string;
  candidateId: string;
  seedId: string | null;
  batchId: string;
  title: string;
  summary: string;
  confidenceScore: number;
  completenessScore: number;
  evidenceJson: Record<string, unknown>;
  missingFieldsJson: string[];
  recommendedActionsJson: Array<{ label: string; reason: string }>;
  mediaSummaryJson: Record<string, unknown>;
  visibility: VisibilityScores;
  visibilityEstimate: VisibilityEstimate;
  healthScore: BusinessHealthScore;
  strengths: string[];
  weaknesses: string[];
  seoExplanation: string;
  geoExplanation: string;
  disclaimer: string;
  generatedMarkdown: string;
  generatedHtml: string | null;
  generatedPdfUrl: string | null;
  status: BriefStatus;
  createdAt: string;
  updatedAt: string;
  downloadedAt: string | null;
  claimStartedAt: string | null;
}
