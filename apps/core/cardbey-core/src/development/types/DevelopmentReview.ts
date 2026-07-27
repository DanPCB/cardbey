// apps/core/cardbey-core/src/development/types/DevelopmentReview.ts

export type ReviewType =
  | 'DESIGN'
  | 'CODE'
  | 'SECURITY'
  | 'PERFORMANCE'
  | 'MIGRATION'
  | 'RELEASE';

export interface DevelopmentReview {
  id: string;
  missionId: string;
  
  type: ReviewType;
  reviewer: string;
  
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES';
  
  comments?: string;
  suggestions?: string[];
  findings?: Array<{
    severity: 'INFO' | 'WARNING' | 'ERROR';
    message: string;
    location?: string;
  }>;
  
  approvedAt?: Date;
  rejectedAt?: Date;
}