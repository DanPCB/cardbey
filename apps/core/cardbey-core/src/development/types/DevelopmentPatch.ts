// apps/core/cardbey-core/src/development/types/DevelopmentPatch.ts

export interface DevelopmentPatch {
  id: string;
  missionId: string;
  
  summary: string;
  description: string;
  
  filesAdded: string[];
  filesModified: string[];
  filesDeleted: string[];
  
  linesAdded: number;
  linesDeleted: number;
  
  diff: string;
  commitHash?: string;
  
  author: string;
  createdAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  approved: boolean;
}