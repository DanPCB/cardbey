// apps/core/cardbey-core/src/development/types/DevelopmentImpactReport.ts

export interface DevelopmentImpactReport {
  id: string;
  missionId: string;
  
  affectedSystems: string[];
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
  
  generatedAt: Date;
  generatedBy: string;
}