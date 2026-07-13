// apps/core/cardbey-core/src/development/types/DevelopmentCheckRun.ts

export type CheckType =
  | 'LINT'
  | 'TYPECHECK'
  | 'UNIT_TEST'
  | 'INTEGRATION_TEST'
  | 'E2E_TEST'
  | 'BUILD'
  | 'MIGRATION_TEST'
  | 'SECURITY_SCAN'
  | 'DEPENDENCY_SCAN';

export interface DevelopmentCheckRun {
  id: string;
  missionId: string;
  
  type: CheckType;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED';
  
  duration: number;
  output: string;
  error?: string;
  
  startedAt: Date;
  completedAt?: Date;
}