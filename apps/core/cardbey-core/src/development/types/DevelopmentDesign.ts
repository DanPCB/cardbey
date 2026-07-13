/**
 * Versioned development design artifact (Phase 2).
 */

export type DevelopmentChangeType = 'MODIFY' | 'CREATE' | 'DELETE';

export interface DevelopmentDesign {
  id: string;
  missionId: string;
  version: number;
  summary: string;
  diagnosis: string;
  proposedChanges: Array<{
    file: string;
    purpose: string;
    changeType: DevelopmentChangeType;
  }>;
  testPlan: string[];
  rollbackPlan: string;
  risks: string[];
  proposedBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  changesRequestedBy?: string;
  changesRequestedAt?: string;
  changesRequestedReason?: string;
}
