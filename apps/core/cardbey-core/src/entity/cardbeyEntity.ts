/**
 * Cardbey Entity Framework — Phase 1 contract.
 * Shared type for Store, Product, and Promotion entities.
 * Additive only; do not overdesign.
 */

export type CardbeyEntityType = 'store' | 'product' | 'promotion';

export interface CardbeyEntityBodyConfig {
  mode?: 'guide' | 'task' | 'performer' | 'operator';
  assistantEnabled?: boolean;
  chatEnabled?: boolean;
  quickActions?: string[];
  identity?: {
    name?: string;
    role?: string;
    avatar?: string;
    tone?: string;
  };
}

export interface CardbeyEntitySurfaceConfig {
  surfaceType?: string;
  placement?: string;
}

export interface CardbeyEntitySignalConfig {
  trackViews?: boolean;
  trackClicks?: boolean;
  trackChats?: boolean;
  trackConversion?: boolean;
  trackScans?: boolean;
}

export interface CardbeyEntityMissionHooks {
  onHighInterest?: string;
  onLowConversion?: string;
  onRepeatedQuestions?: string;
  availableGoals?: string[];
}

export interface CardbeyEntity {
  entityId: string;
  entityType: CardbeyEntityType;
  objectId: string;
  brainContext: Record<string, unknown>;
  bodyConfig: CardbeyEntityBodyConfig;
  surfaceConfig: CardbeyEntitySurfaceConfig;
  signalConfig: CardbeyEntitySignalConfig;
  missionHooks: CardbeyEntityMissionHooks;
}
