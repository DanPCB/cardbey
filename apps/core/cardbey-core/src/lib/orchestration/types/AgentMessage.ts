/**
 * Typed inter-agent message schema.
 * Every specialist agent reads inputs and writes outputs in this shape.
 * Prevents silent shape mismatches between Research → Build → QA → Action.
 *
 * Runtime agents remain JS classes; this file is the contract source of truth.
 */

export type EnrichmentStatus = 'ENRICHED' | 'PARTIAL' | 'UNENRICHED' | string;

export interface StoreKnowledgeDTO {
  id?: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  suburb: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  socialLinks?: Record<string, string> | Array<{ platform: string; url: string }> | null;
  heroImageUrl: string | null;
  openingHours: string | null;
  canonicalUrl?: string | null;
  enrichmentStatus?: EnrichmentStatus | null;
  descriptionProvenance?: string | null;
  categoryProvenance?: string | null;
  aiSearchReady?: boolean | null;
}

export interface AgentContext {
  missionId: string;
  storeId: string | null;
  userId?: string | null;
  brief: string;
  storeKnowledge: StoreKnowledgeDTO | null;
  blackboard?: {
    appendEvent?: (
      missionId: string,
      eventType: string,
      payload: unknown,
      opts?: object,
    ) => Promise<unknown>;
    getEvents?: (missionId: string, opts?: unknown) => Promise<unknown>;
  } | null;
  sseEmitter?: {
    emit?: (event: string, payload: unknown) => void;
  } | null;
  tenantId?: string | null;
}

export interface ResearchOutput {
  type: 'research';
  marketContext: string;
  audienceInsight: string;
  keyMessages: string[];
  toneRecommendation: string;
  contentAngles: string[];
  dataQualityNote: string | null;
  summary?: string;
}

export interface GraphicBrief {
  format: 'square' | 'landscape' | 'portrait' | 'banner' | string;
  colorPalette: string[];
  visualConcept: string;
  textOverlay: string;
  mood: string;
}

export interface BuildOutput {
  type: 'build' | 'copy' | 'campaign' | string;
  headline: string;
  subheadline: string | null;
  bodyText: string;
  callToAction: string;
  graphicBrief: GraphicBrief | null;
  alternateHeadlines: string[];
  outputType: 'campaign' | 'post' | 'promotion' | 'announcement' | 'other' | string;
  summary?: string;
  content?: string;
}

export interface QAResult {
  type: 'qa';
  passed: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  approvedForAction: boolean;
  summary?: string;
}

export interface ActionResult {
  type: 'action' | 'promotion_asset' | 'copy' | string;
  actionsPerformed: string[];
  artifactIds: string[];
  artifactUrls: string[];
  summary: string;
  graphicUrl?: string | null;
  artifactUrl?: string | null;
  content?: string | null;
}

/** Additive blackboard event types for live specialists (payload shape unchanged). */
export type LiveAgentBlackboardEventType =
  | 'research:complete'
  | 'build:complete'
  | 'qa:complete'
  | 'action:complete'
  | 'agent:error'
  | 'artifact:created';
