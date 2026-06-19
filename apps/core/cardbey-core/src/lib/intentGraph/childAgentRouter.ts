/**
 * Child agent router — maps vision intents to agent types and runtime targets.
 */

import type { ChildAgentType, EntityContext, IntentNode } from './types.js';

export type AgentRoute = {
  agentType: ChildAgentType;
  targetRuntime: 'client' | 'performer' | 'mission_pipeline';
  missionType?: string;
  performerPrompt?: string;
  clientAction?: string;
};

const INTENT_AGENT_MAP: Record<string, ChildAgentType> = {
  create_prestore_candidate: 'DiscoveryAgent',
  check_if_on_cardbey: 'DiscoveryAgent',
  find_seller: 'DiscoveryAgent',
  enrich_business_profile: 'ResearchAgent',
  open_website: 'ResearchAgent',
  identify_product: 'ResearchAgent',
  order_now: 'CommerceAgent',
  request_offer: 'CommerceAgent',
  claim_business: 'ClaimAgent',
  create_store_from_scan: 'ClaimAgent',
  extract_menu_items: 'CatalogAgent',
  create_catalog_draft: 'CatalogAgent',
  translate_menu: 'CatalogAgent',
  add_to_store_catalog: 'CatalogAgent',
  create_campaign_from_scan: 'CampaignAgent',
  create_event: 'CampaignAgent',
  contact_business: 'OutreachAgent',
  contact_store: 'OutreachAgent',
  compare_nearby: 'MapAgent',
  explain_only: 'ComplianceAgent',
  do_not_store: 'ComplianceAgent',
  block_acquisition: 'ComplianceAgent',
  save_to_suitcase: 'SuitcaseAgent',
  save_store: 'SuitcaseAgent',
  share_store: 'SuitcaseAgent',
  save_event: 'SuitcaseAgent',
  ask_about_store: 'PerformerAgent',
  report_wrong_result: 'PerformerAgent',
};

const MISSION_INTENT_TYPES: Record<string, string> = {
  create_prestore_candidate: 'vision_intent_mission',
  extract_menu_items: 'vision_intent_mission',
  create_catalog_draft: 'vision_intent_mission',
  create_campaign_from_scan: 'vision_intent_mission',
  create_store_from_scan: 'vision_intent_mission',
  claim_business: 'vision_intent_mission',
  enrich_business_profile: 'vision_intent_mission',
  contact_business: 'vision_intent_mission',
  contact_store: 'vision_intent_mission',
  outreach_draft: 'vision_intent_mission',
  create_event: 'vision_intent_mission',
  find_seller: 'vision_intent_mission',
  compare_nearby: 'vision_intent_mission',
  translate_menu: 'vision_intent_mission',
};

export function routeToChildAgent(node: IntentNode, entity: EntityContext): AgentRoute {
  const agentType = INTENT_AGENT_MAP[node.id] ?? node.agentType;

  if (node.clientHandled) {
    return {
      agentType,
      targetRuntime: 'client',
      clientAction: node.runtimeAction,
    };
  }

  if (['ask_about_store', 'report_wrong_result', 'explain_only', 'identify_product'].includes(node.id)) {
    return {
      agentType: 'PerformerAgent',
      targetRuntime: 'performer',
    };
  }

  const missionType = MISSION_INTENT_TYPES[node.runtimeAction] ?? MISSION_INTENT_TYPES[node.id];
  if (missionType) {
    return {
      agentType,
      targetRuntime: 'mission_pipeline',
      missionType,
    };
  }

  return {
    agentType,
    targetRuntime: 'performer',
  };
}

export function resolveAgentForIntent(intentId: string): ChildAgentType {
  return INTENT_AGENT_MAP[intentId] ?? 'PerformerAgent';
}
