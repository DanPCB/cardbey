/**
 * Phase 3 — map Performer tool hints to mission families (calibration only).
 */

import type { MissionFamily } from '../types.js';

const TOOL_FAMILY: Record<string, MissionFamily> = {
  setup_loyalty_program: 'loyalty',
  launch_campaign: 'campaign',
  create_campaign: 'campaign',
  import_catalog: 'catalog',
  create_store: 'store',
  create_offer: 'offer',
  save_to_suitcase: 'content',
  general_chat: 'generic',
  ingest_asset_for_intent_detection: 'generic',
};

export function toolToMissionFamily(tool: string | null | undefined): MissionFamily | null {
  const key = String(tool ?? '').trim();
  return TOOL_FAMILY[key] ?? null;
}

export function isCampaignTool(tool: string | null | undefined): boolean {
  const t = String(tool ?? '').trim();
  return t === 'launch_campaign' || t === 'create_campaign';
}

export function isLoyaltyTool(tool: string | null | undefined): boolean {
  return String(tool ?? '').trim() === 'setup_loyalty_program';
}

export function userTextMentionsCampaign(text: string | null | undefined): boolean {
  return /\b(campaign|promotion|promo|marketing|flyer|advertis)\b/i.test(String(text ?? ''));
}

export function userTextMentionsLoyalty(text: string | null | undefined): boolean {
  return /\b(loyalty|stamp|rewards?|punch\s*card|membership)\b/i.test(String(text ?? ''));
}
