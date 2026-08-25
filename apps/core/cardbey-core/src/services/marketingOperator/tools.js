/**
 * Explicit marketing operator tool contracts with authority checks.
 * LLM never receives access tokens.
 */

import { Features } from '../../config/features.js';
import { getCardbeyCapabilityRegistry } from './capabilityRegistry.js';
import { validateProductClaims } from './claimValidator.js';
import * as campaignService from './campaignService.js';
import * as contentService from './contentService.js';
import { hasMarketingPermission, PERMISSIONS } from './permissions.js';
import { createTrackedDestination } from './attributionService.js';

/**
 * @param {object} user
 * @param {string} perm
 */
function assertPerm(user, perm) {
  if (!hasMarketingPermission(user, perm)) {
    return { ok: false, error: 'permission_denied', permission: perm };
  }
  return null;
}

function assertOperatorEnabled() {
  if (!Features.marketingOperator.v1) {
    return { ok: false, error: 'marketing_operator_disabled' };
  }
  return null;
}

export const marketingOperatorTools = {
  getCardbeyCapabilityRegistry: {
    name: 'getCardbeyCapabilityRegistry',
    description: 'Return truthful Cardbey capability claims (no tokens).',
    requiredPermission: PERMISSIONS.MARKETING_VIEWER,
    /**
     * @param {object} _args
     * @param {{ user?: object }} ctx
     */
    async execute(_args, ctx = {}) {
      const gate = assertOperatorEnabled() || assertPerm(ctx.user, PERMISSIONS.MARKETING_VIEWER);
      if (gate) return gate;
      return { ok: true, registry: getCardbeyCapabilityRegistry() };
    },
  },

  createCampaignDraft: {
    name: 'createCampaignDraft',
    description: 'Create a DRAFT marketing campaign (never publishes).',
    requiredPermission: PERMISSIONS.MARKETING_EDITOR,
    async execute(args, ctx = {}) {
      const gate = assertOperatorEnabled() || assertPerm(ctx.user, PERMISSIONS.MARKETING_EDITOR);
      if (gate) return gate;
      const campaign = await campaignService.createCampaign(args || {}, { actorId: ctx.user?.id });
      return { ok: true, campaign };
    },
  },

  generateContentDraft: {
    name: 'generateContentDraft',
    description: 'Create a DRAFT content item (structured; not live publish).',
    requiredPermission: PERMISSIONS.MARKETING_EDITOR,
    async execute(args, ctx = {}) {
      const gate = assertOperatorEnabled() || assertPerm(ctx.user, PERMISSIONS.MARKETING_EDITOR);
      if (gate) return gate;
      if (args?.campaignId && (args?.useAi !== false)) {
        const { generateCampaignContent } = await import('./campaignService.js');
        if (Features.marketingOperator.aiGenerationV1 || args?.forceDeterministic) {
          return generateCampaignContent(args.campaignId, {
            language: args.language,
            contentType: args.contentType,
            actorId: ctx.user?.id,
            destination: args.destination,
          });
        }
      }
      const content = await contentService.createContent(args || {}, { actorId: ctx.user?.id });
      return {
        ok: true,
        content,
        aiGeneration: false,
        generationMeta: content.generationMeta || { mode: 'deterministic_fallback' },
      };
    },
  },

  validateProductClaims: {
    name: 'validateProductClaims',
    description: 'Validate marketing claims against capability registry.',
    requiredPermission: PERMISSIONS.MARKETING_VIEWER,
    async execute(args, ctx = {}) {
      const gate = assertOperatorEnabled() || assertPerm(ctx.user, PERMISSIONS.MARKETING_VIEWER);
      if (gate) return gate;
      const result = validateProductClaims(args?.text || '', args?.language || 'en');
      return { ok: true, validation: result };
    },
  },

  submitForApproval: {
    name: 'submitForApproval',
    description: 'Validate and move content to READY_FOR_APPROVAL.',
    requiredPermission: PERMISSIONS.MARKETING_EDITOR,
    async execute(args, ctx = {}) {
      const gate = assertOperatorEnabled() || assertPerm(ctx.user, PERMISSIONS.MARKETING_EDITOR);
      if (gate) return gate;
      const result = await contentService.submitForApproval(args?.contentId, { actorId: ctx.user?.id });
      if (!result) return { ok: false, error: 'not_found' };
      return { ok: true, ...result };
    },
  },

  scheduleApprovedContent: {
    name: 'scheduleApprovedContent',
    description: 'Schedule APPROVED content (mock unless live flags on).',
    requiredPermission: PERMISSIONS.MARKETING_PUBLISHER,
    async execute(args, ctx = {}) {
      const gate = assertOperatorEnabled() || assertPerm(ctx.user, PERMISSIONS.MARKETING_PUBLISHER);
      if (gate) return gate;
      if (!Features.marketingOperator.autoScheduleV1 && !args?.force) {
        // Explicit tool may still schedule via mock; live remains gated in provider.
      }
      return contentService.scheduleContent(args?.contentId, {
        scheduledAt: args?.scheduledAt,
        idempotencyKey: args?.idempotencyKey,
        actorId: ctx.user?.id,
      });
    },
  },

  publishApprovedContent: {
    name: 'publishApprovedContent',
    description: 'Publish APPROVED content — live path fail-closed by default.',
    requiredPermission: PERMISSIONS.MARKETING_PUBLISHER,
    async execute(args, ctx = {}) {
      const gate = assertOperatorEnabled() || assertPerm(ctx.user, PERMISSIONS.MARKETING_PUBLISHER);
      if (gate) return gate;
      return contentService.publishContent(args?.contentId, {
        idempotencyKey: args?.idempotencyKey,
        actorId: ctx.user?.id,
      });
    },
  },

  createTrackedDestination: {
    name: 'createTrackedDestination',
    description: 'Build attribution-tracked destination URL.',
    requiredPermission: PERMISSIONS.MARKETING_EDITOR,
    async execute(args, ctx = {}) {
      const gate = assertOperatorEnabled() || assertPerm(ctx.user, PERMISSIONS.MARKETING_EDITOR);
      if (gate) return gate;
      return createTrackedDestination(args || {});
    },
  },
};

/**
 * @param {string} toolName
 * @param {object} args
 * @param {{ user?: object }} [ctx]
 */
export async function executeMarketingTool(toolName, args, ctx = {}) {
  const tool = marketingOperatorTools[toolName];
  if (!tool) return { ok: false, error: 'unknown_tool', toolName };
  // Ensure tool results never include token-like fields
  const result = await tool.execute(args || {}, ctx);
  if (result && typeof result === 'object') {
    delete result.accessToken;
    delete result.pageAccessToken;
    delete result.token;
  }
  return result;
}

export default marketingOperatorTools;
