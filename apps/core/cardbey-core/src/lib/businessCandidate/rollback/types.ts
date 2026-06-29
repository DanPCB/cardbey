/**
 * Discovery rollback — governed soft rollback for batches and individual businesses.
 */

export type RollbackType = 'BATCH' | 'BUSINESS';
export type RollbackMode = 'DRY_RUN' | 'EXECUTE';
export type RollbackJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'FAILED';
export type RollbackSafetyLevel = 'SAFE' | 'NEEDS_CONFIRMATION' | 'BLOCKED';

export interface RollbackAffectedCounts {
  candidates: number;
  seeds: number;
  briefs: number;
  mediaAssets: number;
  claimIntents: number;
  storeDrafts: number;
  blocked: number;
}

export interface RollbackAffectedRecord {
  entityType: string;
  entityId: string;
  label: string;
  previousStatus: string | null;
  plannedStatus: string | null;
  blocked: boolean;
  blockReason?: string;
}

export interface RollbackJob {
  id: string;
  rollbackType: RollbackType;
  batchId: string | null;
  candidateId: string | null;
  seedId: string | null;
  storeId: string | null;
  requestedByUserId: string;
  reason: string;
  mode: RollbackMode;
  status: RollbackJobStatus;
  safetyLevel: RollbackSafetyLevel;
  affectedCountsJson: RollbackAffectedCounts;
  affectedRecordsJson: RollbackAffectedRecord[];
  blockedReasonsJson: string[];
  rollbackActionsJson: RollbackPlannedAction[];
  warningsJson: string[];
  requiredPermissionsJson: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  dryRunJobId: string | null;
}

export interface RollbackPlannedAction {
  entityType:
    | 'BusinessCandidate'
    | 'BusinessSeed'
    | 'CandidateIntelligenceBrief'
    | 'CandidateMediaAsset'
    | 'ClaimIntent'
    | 'StoreDraft';
  entityId: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  blocked: boolean;
  blockReason?: string;
}

export interface RollbackAuditEvent {
  id: string;
  rollbackJobId: string;
  entityType: string;
  entityId: string;
  previousStatus: string | null;
  newStatus: string | null;
  action: string;
  reason: string;
  metadataJson: Record<string, unknown>;
  createdAt: string;
}

export interface RollbackDryRunPreview {
  job: RollbackJob;
  safetyLevel: RollbackSafetyLevel;
  affectedCounts: RollbackAffectedCounts;
  affectedRecords: RollbackAffectedRecord[];
  blockedReasons: string[];
  warnings: string[];
  requiredPermissions: string[];
  recommendedAction: string;
}

export interface BatchRollbackInput {
  batchId: string;
  reason: string;
  includeQaApproved?: boolean;
  includeClaimableSeeds?: boolean;
  includeBriefs?: boolean;
  includeMedia?: boolean;
  includeClaimIntents?: boolean;
  force?: boolean;
}

export interface BusinessRollbackInput {
  candidateId?: string | null;
  seedId?: string | null;
  storeId?: string | null;
  reason: string;
  includeBriefs?: boolean;
  includeMedia?: boolean;
  includeClaimIntents?: boolean;
  force?: boolean;
}
