/**
 * Deterministic requirement templates from intent/tool/message — no LLM.
 */

import type { MissionRequirement } from './types.ts';

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

export function extractMissionRequirements(input: ExtractRequirementsInput): MissionRequirement[] {
  const tool = String(input.tool ?? '').trim();
  const msg = String(input.userMessage ?? '');
  const lower = msg.toLowerCase();
  const out: MissionRequirement[] = [];

  const websiteOrStore =
    tool === 'create_store' ||
    tool === 'generate_mini_website' ||
    /mini\s*website|create\s+(a\s+)?store|build\s+(a\s+)?store/i.test(lower);

  if (websiteOrStore) {
    out.push(
      req('req.store.brand', 'Brand identity', 'store', 'store_setup', 'critical', 'Business name and category'),
      req('req.store.location', 'Location context', 'store', 'store_setup', 'important', 'Service area or address hint'),
      req('req.website.structure', 'Website structure', 'website', 'mini_website', 'critical', 'Hero, sections, CTA outline'),
      req('req.publish.path', 'Publish path', 'store', 'go_live', 'optional', 'Draft review and publish eligibility'),
    );
  }

  const campaignish =
    tool === 'launch_campaign' ||
    tool === 'create_promotion' ||
    tool === 'market_research' ||
    /campaign|promotion|promo|marketing|discount|offer/i.test(lower);

  if (campaignish) {
    out.push(
      req('req.campaign.goal', 'Campaign goal', 'campaign', 'messaging', 'critical', 'Objective and audience'),
      req('req.campaign.channel', 'Channels', 'campaign', 'distribution', 'important', 'Target channels'),
      req('req.campaign.copy', 'Copy and CTA', 'campaign', 'assets', 'important', 'Headline, body, CTA'),
      req('req.campaign.assets', 'Visual assets', 'campaign', 'creative', 'optional', 'Images or templates'),
    );
  }

  const researchish =
    tool === 'analyze_store' || /\b(supplier|vendor|sourcing|compare|research|benchmark)\b/i.test(lower);

  if (researchish && !websiteOrStore) {
    out.push(
      req('req.research.query', 'Search scope', 'research', 'discovery', 'critical', 'What to find or compare'),
      req('req.research.sources', 'Evidence basis', 'research', 'validation', 'important', 'Sources or criteria'),
      req('req.research.summary', 'Summarized insight', 'research', 'output', 'important', 'Actionable summary'),
    );
  }

  const quoteish = /\b(quote|invoice|estimate|quotation|proforma)\b/i.test(lower);
  if (quoteish) {
    out.push(
      req('req.quote.pricing', 'Pricing basis', 'commercial', 'quote', 'critical', 'Rates, tax, currency'),
      req('req.quote.line_items', 'Line items', 'commercial', 'quote', 'critical', 'Products or services listed'),
      req('req.quote.customer', 'Customer details', 'commercial', 'quote', 'important', 'Bill-to / contact'),
      req('req.quote.document', 'Output document', 'commercial', 'quote', 'optional', 'PDF or shareable doc'),
    );
  }

  if (input.hasImageAttachment && out.length === 0) {
    out.push(
      req('req.vision.decode', 'Image understanding', 'vision', 'intake', 'important', 'Text or objects from attachment'),
    );
  }

  if (out.length === 0) {
    out.push(
      req('req.generic.intent', 'Clear intent', 'general', 'routing', 'critical', 'Actionable user goal'),
      req('req.generic.context', 'Operating context', 'general', 'routing', 'optional', 'Store or draft if relevant'),
    );
  }

  if (!input.hasStoreId && (campaignish || tool === 'improve_hero' || tool === 'rewrite_descriptions')) {
    out.push(
      req('req.context.store', 'Active store', 'context', 'authorization', 'critical', 'storeId for mutating tools'),
    );
  }

  return out;
}
