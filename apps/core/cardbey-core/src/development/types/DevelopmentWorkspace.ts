// apps/core/cardbey-core/src/development/types/DevelopmentWorkspace.ts

export interface DevelopmentWorkspace {
  id: string;
  missionId: string;
  
  path: string;
  repository: string;
  branch: string;
  commitHash?: string;
  
  status: 'PREPARING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CLEANED';
  
  createdAt: Date;
  preparedAt?: Date;
  cleanedAt?: Date;
}

export interface CommandResult {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timestamp: Date;
}

export interface WorkspaceFile {
  path: string;
  content: string;
  mode?: string;
}