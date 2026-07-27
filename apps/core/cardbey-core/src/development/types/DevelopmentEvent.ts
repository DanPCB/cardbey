// apps/core/cardbey-core/src/development/types/DevelopmentEvent.ts

export type DevelopmentEventType =
  | 'MISSION_CREATED'
  | 'EVIDENCE_FROZEN'
  | 'IMPACT_ANALYSED'
  | 'DESIGN_PROPOSED'
  | 'DESIGN_APPROVED'
  | 'DESIGN_REJECTED'
  | 'WORKSPACE_PREPARED'
  | 'IMPLEMENTATION_STARTED'
  | 'PATCH_CREATED'
  | 'PATCH_REVIEW_SUBMITTED'
  | 'PATCH_APPROVED'
  | 'PATCH_REJECTED'
  | 'PR_CREATED'
  | 'CI_STARTED'
  | 'CI_PASSED'
  | 'CI_FAILED'
  | 'STAGING_DEPLOYED'
  | 'STAGING_VERIFIED'
  | 'STAGING_FAILED'
  | 'RELEASE_APPROVED'
  | 'RELEASE_REJECTED'
  | 'PRODUCTION_DEPLOYED'
  | 'PRODUCTION_VERIFIED'
  | 'MISSION_COMPLETED'
  | 'MISSION_CANCELLED'
  | 'MISSION_ROLLED_BACK';

export interface DevelopmentEvent {
  id: string;
  missionId: string;
  
  type: DevelopmentEventType;
  
  data: Record<string, any>;
  actor: string;
  
  createdAt: Date;
}