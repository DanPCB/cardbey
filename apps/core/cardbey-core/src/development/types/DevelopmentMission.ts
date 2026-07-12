// apps/core/cardbey-core/src/development/types/DevelopmentMission.ts

export type DevelopmentMissionType =
  | 'BUG_FIX'
  | 'FEATURE'
  | 'REFACTOR'
  | 'PERFORMANCE'
  | 'DATABASE_MIGRATION'
  | 'INFRASTRUCTURE'
  | 'THIRD_PARTY_INTEGRATION'
  | 'SECURITY_PATCH'
  | 'DOCUMENTATION';

export type DevelopmentMissionState =
  | 'REQUESTED'
  | 'EVIDENCE_REQUIRED'
  | 'ANALYSING'
  | 'IMPACT_ANALYSED'
  | 'DESIGN_PROPOSED'
  | 'AWAITING_DESIGN_APPROVAL'
  | 'WORKSPACE_PREPARING'
  | 'IMPLEMENTING'
  | 'PATCH_READY'
  | 'TESTING'
  | 'TEST_FAILED'
  | 'AWAITING_CODE_REVIEW'
  | 'READY_FOR_PR'
  | 'PR_CREATED'
  | 'CI_RUNNING'
  | 'CI_FAILED'
  | 'READY_FOR_STAGING'
  | 'STAGING_DEPLOYING'
  | 'STAGING_VERIFYING'
  | 'STAGING_FAILED'
  | 'AWAITING_RELEASE_APPROVAL'
  | 'PRODUCTION_DEPLOYING'
  | 'PRODUCTION_VERIFYING'
  | 'COMPLETED'
  | 'ROLLED_BACK'
  | 'CANCELLED'
  | 'FAILED';

export type DevelopmentExecutionMode = 'MANUAL' | 'GOVERNED_AUTOMATION';

export interface DevelopmentMission {
  id: string;
  type: DevelopmentMissionType;
  repositoryId: string;
  baseBranch: string;
  title: string;
  request: string;
  expectedOutcome: string;
  observedBehaviour?: string;
  evidenceSnapshotId?: string;
  specificationId?: string;
  workspaceId?: string;
  pullRequestId?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  state: DevelopmentMissionState;
  requestedBy: string;
  approvedBy?: string;
  executionMode?: DevelopmentExecutionMode;
  approvedDesignId?: string;
  approvedDesignVersion?: number;
  approvedPatchId?: string;
  approvedPatchVersion?: number;
  failureReason?: string;
  rejectionReason?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}