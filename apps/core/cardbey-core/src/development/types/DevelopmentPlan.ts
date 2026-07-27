// apps/core/cardbey-core/src/development/types/DevelopmentPlan.ts

export interface DevelopmentPlan {
  id: string;
  missionId: string;
  
  summary: string;
  architecture: string;
  
  dataModel?: {
    newModels: string[];
    modifiedModels: string[];
    migrations: string[];
  };
  
  apis: {
    newEndpoints: string[];
    modifiedEndpoints: string[];
    deprecatedEndpoints: string[];
  };
  
  frontend: {
    newPages: string[];
    modifiedPages: string[];
    newComponents: string[];
  };
  
  permissions: {
    newPermissions: string[];
    modifiedPermissions: string[];
  };
  
  tests: {
    unit: string[];
    integration: string[];
    e2e: string[];
  };
  
  rollback: {
    plan: string;
    estimatedTime: string;
  };
  
  observability: {
    metrics: string[];
    logs: string[];
    alerts: string[];
  };
  
  proposedAt: Date;
  proposedBy: string;
  approvedBy?: string;
  approvedAt?: Date;
}