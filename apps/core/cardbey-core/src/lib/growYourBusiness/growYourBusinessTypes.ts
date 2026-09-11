/**
 * User-facing Grow Your Business contracts.
 * Internal G1–G4 / Market Intent / graph fields must not appear on this DTO.
 */

export type GrowClarificationCode = 'missing_has' | 'missing_want' | 'low_confidence' | 'not_business_goal';

export type GrowOpportunityKind = 'verified_match' | 'research_candidate' | 'potential_match';

export type GrowNextActionId =
  | 'research_market'
  | 'create_promotion'
  | 'improve_profile'
  | 'save_request';

export type GrowFacet = {
  label: string;
  location: string | null;
};

export type GrowUnderstanding = {
  youHave: GrowFacet;
  youWant: GrowFacet;
  usedBusinessContext: boolean;
  confidence: 'high' | 'medium' | 'low';
};

export type GrowOpportunity = {
  id: string;
  kind: GrowOpportunityKind;
  whoWhat: string;
  whyRelevant: string;
  matchWhy: string;
  location: string | null;
  confidenceLabel: 'strong_fit' | 'possible_fit' | null;
};

export type GrowNextAction = {
  id: GrowNextActionId;
};

export type GrowAnalyzeStatus = 'understood' | 'needs_clarification' | 'empty' | 'failed';

export type GrowAnalyzeResult = {
  ok: boolean;
  status: GrowAnalyzeStatus;
  understanding: GrowUnderstanding | null;
  clarification: { code: GrowClarificationCode } | null;
  opportunities: GrowOpportunity[];
  nextActions: GrowNextAction[];
  empty: boolean;
  retryable: boolean;
  error: string | null;
  /** True only on the guest preview path — never set on authenticated analyze. */
  guestPreview?: boolean;
};

export type GrowPreviewInput = {
  rawText: string;
  locale?: string | null;
};

export type GrowBusinessContext = {
  storeId: string;
  name: string | null;
  type: string | null;
  tagline: string | null;
  country: string | null;
  city: string | null;
};

export type GrowAnalyzeInput = {
  rawText: string;
  userId: string;
  storeId?: string | null;
  locale?: string | null;
};
