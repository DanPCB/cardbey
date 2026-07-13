// apps/core/cardbey-core/src/development/types/DevelopmentDeployment.ts

export type DeploymentTarget =
  | 'STAGING'
  | 'PRODUCTION'
  | 'PREVIEW';

export interface DevelopmentDeployment {
  id: string;
  missionId: string;
  
  target: DeploymentTarget;
  environment: string;
  
  status: 'PENDING' | 'DEPLOYING' | 'DEPLOYED' | 'FAILED' | 'VERIFYING' | 'VERIFIED' | 'ROLLED_BACK';
  
  url?: string;
  version?: string;
  commitHash?: string;
  
  logs: string[];
  errors: string[];
  
  requestedAt: Date;
  requestedBy: string;
  approvedBy?: string;
  approvedAt?: Date;
  completedAt?: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
}