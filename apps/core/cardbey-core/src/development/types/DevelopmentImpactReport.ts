// apps/core/cardbey-core/src/development/types/DevelopmentImpactReport.ts

export interface DevelopmentImpactReport {
  id: string;
  missionId: string;

  affectedSystems: string[];
  observedSystems: string[];
  modifiedSystems: string[];
  canonicalPath: string;
  legacyPaths: string[];

  proposedFiles: string[];
  migrationRequired: boolean;
  securityReviewRequired: boolean;
  performanceReviewRequired: boolean;

  estimatedRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedEffort: 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE';

  acceptanceCriteria: string[];

  findings: Array<{
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
    message: string;
    location?: string;
  }>;

  recommendations: string[];

  /** Canonical repository root used for analysis. */
  repoRoot?: string;
  /** Canonical commit SHA that was analysed. The workspace must be checked out at this revision. */
  repoRevision?: string;

  /** Repository surface selected by ChangeSurfaceSelector for the coding provider. */
  changeSurface?: {
    changeTargets: string[];
    contextFiles: string[];
    testTargets: string[];
    lowRelevance: string[];
    lowConfidence: boolean;
  };

  generatedAt: Date;
  generatedBy: string;
}