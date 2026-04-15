/**
 * Structured gap resolution vs normalized capability registry (deterministic).
 */

import type { CapabilityDefinition } from './types.ts';
import type { MissionRequirement, RequirementResolution } from './types.ts';
import { getCapabilityById } from './capabilityRegistryAdapter.ts';

export interface GapModelContext {
  activeTool?: string | null;
  hasStoreId?: boolean;
  hasDraftId?: boolean;
}

function pickCampaignCapability(tool: string): string | undefined {
  if (tool === 'launch_campaign' || tool === 'create_promotion' || tool === 'market_research') return tool;
  return undefined;
}

export function resolveCapabilityGaps(
  requirements: MissionRequirement[],
  capabilities: CapabilityDefinition[],
  ctx: GapModelContext = {},
): RequirementResolution[] {
  const tool = String(ctx.activeTool ?? '').trim();
  const capIds = new Set(capabilities.map((c) => c.id));

  return requirements.map((r): RequirementResolution => {
    if (r.id === 'req.context.store') {
      if (ctx.hasStoreId) {
        return {
          requirementId: r.id,
          state: 'ready',
          matchedCapabilityId: tool || undefined,
          notes: 'store_context_present',
        };
      }
      return {
        requirementId: r.id,
        state: 'missing',
        requiresUserInput: true,
        notes: 'store_required_for_tool',
      };
    }

    if (r.id.startsWith('req.store.') || r.id.startsWith('req.website.') || r.id === 'req.publish.path') {
      if (tool === 'create_store' || tool === 'generate_mini_website') {
        const cap = getCapabilityById(tool);
        return {
          requirementId: r.id,
          state: r.importance === 'optional' ? 'partial' : 'ready',
          matchedCapabilityId: tool,
          notes: cap ? 'tool_covers_store_flow' : undefined,
        };
      }
      return {
        requirementId: r.id,
        state: 'fetchable',
        suggestedChildRole: 'research_child',
        notes: 'awaiting_store_or_website_intent',
      };
    }

    if (r.category === 'campaign') {
      const m = pickCampaignCapability(tool);
      if (m && capIds.has(m)) {
        return {
          requirementId: r.id,
          state: r.id === 'req.campaign.assets' ? 'partial' : 'ready',
          matchedCapabilityId: m,
        };
      }
      return {
        requirementId: r.id,
        state: 'delegatable',
        matchedCapabilityId: 'market_research',
        notes: 'route_via_campaign_tools',
      };
    }

    if (r.category === 'research') {
      if (tool === 'market_research' || tool === 'analyze_store') {
        return {
          requirementId: r.id,
          state: 'ready',
          matchedCapabilityId: tool,
        };
      }
      return {
        requirementId: r.id,
        state: 'substitutable',
        matchedCapabilityId: 'market_research',
        notes: 'default_research_surface',
      };
    }

    if (r.category === 'commercial') {
      return {
        requirementId: r.id,
        state: 'delegatable',
        matchedCapabilityId: tool && capIds.has(tool) ? tool : undefined,
        suggestedChildRole: 'reporting_child',
        notes: 'quote_invoice_manual_or_future_tool',
      };
    }

    if (r.category === 'vision') {
      return {
        requirementId: r.id,
        state: ctx.hasDraftId || tool === 'general_chat' ? 'partial' : 'fetchable',
        notes: 'vision_attachment_followup',
      };
    }

    if (tool && capIds.has(tool)) {
      return {
        requirementId: r.id,
        state: r.importance === 'critical' ? 'ready' : 'partial',
        matchedCapabilityId: tool,
      };
    }

    return {
      requirementId: r.id,
      state: r.importance === 'optional' ? 'partial' : 'missing',
      requiresUserInput: r.importance === 'critical',
      notes: 'no_matching_capability_for_requirement',
    };
  });
}
