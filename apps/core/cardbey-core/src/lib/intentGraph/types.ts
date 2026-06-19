/**
 * Vision Intent Graph — canonical types for scan → entity → intent → agent execution.
 */

export type EntitySourceType =
  | 'qr'
  | 'camera_photo'
  | 'uploaded_image'
  | 'business_card'
  | 'storefront'
  | 'menu'
  | 'product'
  | 'flyer'
  | 'website';

export type EntityContextType =
  | 'cardbey_store'
  | 'external_business'
  | 'service_organisation'
  | 'product'
  | 'event'
  | 'personal_contact'
  | 'unknown'
  | 'sensitive_private';

export type IntentRiskLevel = 'low' | 'medium' | 'high';

export type ChildAgentType =
  | 'DiscoveryAgent'
  | 'ResearchAgent'
  | 'CommerceAgent'
  | 'ClaimAgent'
  | 'CatalogAgent'
  | 'CampaignAgent'
  | 'OutreachAgent'
  | 'MapAgent'
  | 'ComplianceAgent'
  | 'SuitcaseAgent'
  | 'PerformerAgent';

export type EntityContext = {
  id: string;
  sourceType: EntitySourceType;
  rawPayload: string | null;
  imageAssetUrl: string | null;
  detectedText: string | null;
  detectedUrl: string | null;
  resolvedUrl: string | null;
  entityName: string | null;
  entityType: EntityContextType;
  category: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  socialProfiles: Array<{ platform: string; url: string }>;
  coordinates: { latitude: number; longitude: number } | null;
  confidence: number;
  evidence: string[];
  cardbeyMatch: { storeId: string | null; slug: string | null; name: string | null } | null;
  businessSeedMatch: { seedId: string | null } | null;
  discoveryCandidateMatch: { scanEventId: string | null } | null;
  privacyRisk: 'none' | 'low' | 'medium' | 'high';
  safetyFlags: string[];
  scanEventId: string | null;
  userId: string | null;
  sessionId: string | null;
  createdAt: string;
};

export type IntentSuggestion = {
  intentId: string;
  label: string;
  description: string;
  confidence: number;
  riskLevel: IntentRiskLevel;
  requiresConfirmation: boolean;
  requiresAuth: boolean;
  targetRuntime: 'client' | 'performer' | 'mission_pipeline';
  suggestedAgent: ChildAgentType;
  disabledReason?: string | null;
};

export type IntentNode = {
  id: string;
  name: string;
  allowedEntityTypes: EntityContextType[];
  requiredFields: string[];
  requiredPermissions: string[];
  riskLevel: IntentRiskLevel;
  confirmationRequired: boolean;
  runtimeAction: string;
  agentType: ChildAgentType;
  clientHandled?: boolean;
};

export type IntentEdge = {
  fromIntent: string;
  toIntent: string;
  condition?: string;
};

export type PlannedVisionAction = {
  intentId: string;
  agentType: ChildAgentType;
  runtimeAction: string;
  targetRuntime: 'client' | 'performer' | 'mission_pipeline';
  requiresConfirmation: boolean;
  requiresAuth: boolean;
  missionType?: string;
  performerPrompt?: string;
  clientAction?: string;
  metadata: Record<string, unknown>;
};

export type VisionIntentEvent = {
  id: string;
  scanEventId: string | null;
  entityContextId: string;
  userId: string | null;
  sessionId: string | null;
  intentId: string;
  selected: boolean;
  agentType: ChildAgentType;
  missionId: string | null;
  outcome: 'pending' | 'completed' | 'failed' | 'cancelled' | 'client_handled';
  feedback: string | null;
  suggestionsShown: string[];
  createdAt: string;
};

export type VisionIntentExecutionResult = {
  ok: boolean;
  outcome: VisionIntentEvent['outcome'];
  message: string | null;
  missionId: string | null;
  performerPrompt: string | null;
  clientAction: string | null;
  requiresConfirmation: boolean;
  intentEventId: string;
};

export type UserSessionContext = {
  userId: string | null;
  sessionId: string | null;
  isAuthenticated: boolean;
  isBusinessOwner: boolean;
  ownsMatchedStore: boolean;
};
