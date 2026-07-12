// apps/core/cardbey-core/src/development/types/DevelopmentEvidence.ts

export interface EvidenceReference {
  type: 'log' | 'screenshot' | 'request' | 'response';
  url?: string;
  content?: string;
  reference?: string;
}

export interface DevelopmentEvidence {
  id: string;
  missionId: string;
  
  logs: EvidenceReference[];
  screenshots: EvidenceReference[];
  requestIds: string[];
  affectedRoutes: string[];
  suspectedFiles?: string[];
  reproductionSteps: string[];
  
  expectedBehaviour: string;
  currentBehaviour: string;
  
  environment: {
    appVersions: Record<string, string>;
    commitHash: string;
    databaseProvider: string;
    nodeVersion: string;
  };
  
  frozenAt: Date;
  frozenBy: string;
}