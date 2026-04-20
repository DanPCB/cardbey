/**
 * Tool Executor Registry - maps toolName to executor module.
 * Each executor implements execute(input, context?) and returns normalized result.
 * Missing executor => dispatcher returns controlled failure (no crash).
 */

import '../mcp/registerDefaultAdapters.js';
import * as analyze_store from './store/analyze_store.js';
import * as generate_tags from './store/generate_tags.js';
import * as rewrite_descriptions from './store/rewrite_descriptions.js';
import * as improve_hero from './store/improve_hero.js';
import * as assign_promotion_slot from './promotion/assign_promotion_slot.js';
import * as activate_promotion from './promotion/activate_promotion.js';
import * as create_promotion from './promotion/create_promotion.js';
import * as launch_campaign from './promotion/launch_campaign.js';
import * as market_research from './store/market_research.js';
import * as mini_website_get_sections from './store/mini_website_get_sections.js';
import * as generate_section_patches from './store/generate_section_patches.js';
import * as mini_website_patch_sections from './store/mini_website_patch_sections.js';
import * as change_hero_headline from './store/change_hero_headline.js';
import * as propose_website_patch from '../../toolExecutors/store/propose_website_patch.js';
import * as consensus from './store/consensus.js';
import * as content_creator from './content/content_creator.js';
import * as crm from './crm/crm.js';
import * as signage_list_devices from './signage/signage_list_devices.js';
import * as signage_publish_to_devices from './signage/signage_publish_to_devices.js';
import * as edit_artifact from './artifacts/editArtifact.js';
import * as publish_to_social from './social/publishToSocial.js';
import * as connect_social_account from './social/connectSocialAccount.js';
import * as mcp_context_products from './mcp/mcp_context_products.js';
import * as mcp_context_business from './mcp/mcp_context_business.js';
import * as mcp_context_store_assets from './mcp/mcp_context_store_assets.js';
import * as mcp_context_promotions from './mcp/mcp_context_promotions.js';
import * as mcp_context_missions from './mcp/mcp_context_missions.js';
import * as mcp_context_analytics from './mcp/mcp_context_analytics.js';
import * as mcp_google_calendar_create_event from './mcp/mcp_google_calendar_create_event.js';
import { getPrismaClient } from '../prisma.js';

/** @type {Record<string, { execute: (input: object, context?: object) => Promise<object> } | undefined>} */
export const executors = {
  analyze_store,
  market_research,
  mini_website_get_sections,
  generate_section_patches,
  mini_website_patch_sections,
  change_hero_headline,
  propose_website_patch,
  consensus,
  content_creator,
  crm,
  generate_tags,
  rewrite_descriptions,
  improve_hero,
  assign_promotion_slot,
  activate_promotion,
  create_promotion,
  launch_campaign,
  edit_artifact,
  publish_to_social,
  connect_social_account,
  mcp_context_products,
  mcp_context_business,
  mcp_context_store_assets,
  mcp_context_promotions,
  mcp_context_missions,
  mcp_context_analytics,
  mcp_google_calendar_create_event,
  // Stub executors for tools without real implementations yet.
  generate_promotion_asset: {
    async execute(input = {}, context = {}) {
      return {
        status: 'ok',
        output: {
          stub: true,
          toolName: 'generate_promotion_asset',
          input,
          context,
          message: 'Promotion asset generated (stub executor).',
        },
      };
    },
  },
  mission_pipeline_stub: {
    async execute(input = {}, context = {}) {
      const stepId = typeof context?.stepId === 'string' ? context.stepId.trim() : '';
      if (stepId) {
        try {
          const prisma = getPrismaClient();
          await prisma.missionPipelineStep.update({
            where: { id: stepId },
            data: { status: 'completed', outputsJson: { passed: true }, completedAt: new Date() },
          });
        } catch {
          // Best-effort: runner also persists completion; never block stub execution.
        }
      }
      return {
        status: 'ok',
        output: { ok: true, output: { passed: true } },
      };
    },
  },
  resolve_target_screens: {
    async execute(input = {}, context = {}) {
      return {
        status: 'ok',
        output: {
          stub: true,
          toolName: 'resolve_target_screens',
          input,
          context,
          message: 'Target screens resolved (stub executor).',
        },
      };
    },
  },
  prepare_screen_asset: {
    async execute(input = {}, context = {}) {
      return {
        status: 'ok',
        output: {
          stub: true,
          toolName: 'prepare_screen_asset',
          input,
          context,
          message: 'Screen asset prepared (stub executor).',
        },
      };
    },
  },
  assign_screen_slot: {
    async execute(input = {}, context = {}) {
      return {
        status: 'ok',
        output: {
          stub: true,
          toolName: 'assign_screen_slot',
          input,
          context,
          message: 'Screen slot assigned (stub executor).',
        },
      };
    },
  },
  activate_screen_content: {
    async execute(input = {}, context = {}) {
      return {
        status: 'ok',
        output: {
          stub: true,
          toolName: 'activate_screen_content',
          input,
          context,
          message: 'Screen content activated (stub executor).',
        },
      };
    },
  },
  generate_social_posts: {
    async execute(input = {}, context = {}) {
      return {
        status: 'ok',
        output: {
          posts: [],
          generated: true,
          storeId: input?.storeId ?? null,
        },
      };
    },
  },
  create_offer: {
    async execute(input = {}, context = {}) {
      return {
        status: 'ok',
        output: {
          offerId: null,
          created: true,
          stub: true,
          storeId: input?.storeId ?? null,
        },
      };
    },
  },
  smart_visual: {
    async execute(input = {}, context = {}) {
      const prompt = typeof input?.prompt === 'string' ? input.prompt : '';
      return {
        status: 'ok',
        output: {
          message: 'Visual generation completed (stub executor — wire to your image pipeline as needed).',
          storeId: input?.storeId ?? null,
          campaignContext: typeof input?.campaignContext === 'string' ? input.campaignContext : null,
          heroBannerIntent: Boolean(prompt && /hero|banner|storefront/i.test(prompt)),
          artifacts: prompt
            ? [
                {
                  kind: 'generated_visual_placeholder',
                  prompt: prompt.slice(0, 2000),
                  pendingHeroApply: /hero|banner|storefront/i.test(prompt),
                },
              ]
            : [],
        },
      };
    },
  },
  'signage.list-devices': signage_list_devices,
  'signage.publish-to-devices': signage_publish_to_devices,
};

/**
 * @param {string} toolName
 * @returns {{ execute: (input: object, context?: object) => Promise<object> } | undefined}
 */
export function getExecutor(toolName) {
  if (!toolName || typeof toolName !== 'string') return undefined;
  const key = toolName.trim();
  return executors[key];
}
