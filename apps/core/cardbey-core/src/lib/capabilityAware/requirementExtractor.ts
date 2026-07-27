/**
 * Deterministic requirement templates from intent/tool/message — no LLM.
 */

import type { MissionRequirement } from './types.ts';

export interface ExtractRequirementsContext {
  text?: string;
  artifacts?: string[];
  role?: string;
}

export interface ExtractRequirementsInput {
  userMessage: string;
  tool?: string | null;
  intentFamily?: string | null;
  intentSubtype?: string | null;
  hasStoreId?: boolean;
  hasDraftId?: boolean;
  hasImageAttachment?: boolean;
}

function req(
  id: string,
  name: string,
  category: string,
  requiredFor: string,
  importance: MissionRequirement['importance'],
  expectedOutput: string,
): MissionRequirement {
  return { id, name, category, requiredFor, importance, expectedOutput };
}

const STORE_REQUIREMENTS: MissionRequirement[] = [
  req('req_llm_gen', 'LLM Generation', 'ai', 'catalog+copy', 'critical', 'products+descriptions'),
  req('req_image_search', 'Image Search', 'media', 'product images', 'important', 'image_urls'),
  req('req_web_scrape', 'Web Scrape', 'data', 'business enrichment', 'optional', 'business_profile'),
  req('req_content_res', 'Content Resolution', 'ai', 'slogan+hero+tagline', 'important', 'resolved_content'),
];

const DOCUMENT_REQUIREMENTS: MissionRequirement[] = [
  req('req_llm_gen', 'LLM Generation', 'ai', 'document content', 'critical', 'products+descriptions'),
  req('req_qr_gen', 'QR Generation', 'media', 'card QR code', 'important', 'qr_code_url'),
  req('req_concierge', 'Concierge Runtime', 'agent', 'card agent', 'important', 'agent_endpoint'),
];

const CAMPAIGN_REQUIREMENTS: MissionRequirement[] = [
  req('req_llm_gen', 'LLM Generation', 'ai', 'campaign strategy', 'critical', 'products+descriptions'),
  req('req_web_search', 'Web Search', 'data', 'market research', 'important', 'research_data'),
  req('req_stripe', 'Stripe', 'payment', 'promotion', 'optional', 'coupon_id'),
  req('req_gmail', 'Gmail', 'communication', 'campaign email', 'optional', 'email_sent'),
  req('req_calendar', 'Calendar', 'scheduling', 'campaign reminder', 'optional', 'event_id'),
];

const CAMPAIGN_RESEARCH_REQUIREMENTS: MissionRequirement[] = [
  req('req_llm_gen', 'LLM Generation', 'ai', 'research synthesis', 'critical', 'products+descriptions'),
  req('req_web_search', 'Web Search', 'data', 'market research', 'important', 'research_data'),
];

const DEFAULT_REQUIREMENTS: MissionRequirement[] = [
  req('req_llm_gen', 'LLM Generation', 'ai', 'general reasoning', 'critical', 'products+descriptions'),
];

export function extractRequirements(
  intentType: string,
  _context: ExtractRequirementsContext = {},
): MissionRequirement[] {
  const intent = String(intentType ?? '').trim().toLowerCase();
  if (intent === 'create_store' || intent === 'store_setup') return STORE_REQUIREMENTS.map((item) => ({ ...item }));
  if (intent === 'mini_website' || intent === 'create_mini_website' || intent === 'generate_mini_website') {
    return STORE_REQUIREMENTS.map((item) => ({ ...item }));
  }
  if (intent === 'create_smart_document' || intent === 'create_card') {
    return DOCUMENT_REQUIREMENTS.map((item) => ({ ...item }));
  }
  if (intent === 'launch_campaign') return CAMPAIGN_REQUIREMENTS.map((item) => ({ ...item }));
  if (intent === 'campaign_research') return CAMPAIGN_RESEARCH_REQUIREMENTS.map((item) => ({ ...item }));
  return DEFAULT_REQUIREMENTS.map((item) => ({ ...item }));
}

export function extractMissionRequirements(input: ExtractRequirementsInput): MissionRequirement[] {
  return extractRequirements(String(input.tool ?? '').trim(), {
    text: input.userMessage,
  });
}
