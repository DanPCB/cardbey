/**
 * ============================================================
 * PHASE D — LEARNING TYPES
 * ============================================================
 */

export type FeedbackType = 
  | 'thumbs_up'
  | 'thumbs_down'
  | 'rating'
  | 'correction'
  | 'reroll'
  | 'skip'
  | 'abandon'
  | 'success'
  | 'failure';

export interface UserFeedback {
  id: string;
  userId: string;
  sessionId: string;
  type: FeedbackType;
  targetType: 'intent' | 'tool' | 'plan' | 'response' | 'mission';
  targetId: string;
  value: number | string | boolean;
  metadata: {
    intent: string;
    confidence: number;
    context: Record<string, any>;
    timestamp: string;
  };
  createdAt: string;
}

export interface BehaviorPattern {
  id: string;
  userId: string;
  pattern: string;
  frequency: number;
  confidence: number;
  lastObserved: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  userId: string;
  preferredWorkflows: string[];
  skippedSteps: string[];
  frequentlyUsedTools: string[];
  defaultAction: string | null;
  confidenceCalibration: ConfidenceCalibration;
  learningEnabled: boolean;
  updatedAt: string;
}

export interface ConfidenceCalibration {
  intentWeights: Record<string, number>;
  toolWeights: Record<string, number>;
  overallBias: number;
  lastCalibrated: string;
}