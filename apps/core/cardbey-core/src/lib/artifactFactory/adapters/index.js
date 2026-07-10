/**
 * Tool-delegating adapters — bridge legacy executors without pipeline duplication.
 */

import { dispatchTool } from '../../toolDispatcher.js';
import { defineArtifactAdapter, buildToolDispatchEnvelope } from './BaseArtifactAdapter.js';
import { resolveCreativeFactoryId } from '../../factoryRuntime/factoryBootstrap.js';
import { runFactoryExecution } from '../../factoryRuntime/factoryRuntimeExecutor.js';

/**
 * @param {string} toolName
 * @param {Record<string, unknown>} [defaults]
 */
export function createToolDelegatingAdapter(type, toolName, defaults = {}) {
  return defineArtifactAdapter({
    type,
    legacyTools: [toolName],
    async prepare(definition, ctx) {
      return {
        ok: true,
        data: {
          toolName,
          inputs: buildToolDispatchEnvelope({ ...defaults, ...definition.requiredInputs }, definition),
        },
      };
    },
    async generate(definition, ctx) {
      const toolInput = buildToolDispatchEnvelope(
        {
          ...defaults,
          ...definition.requiredInputs,
          ...definition.optionalInputs,
          blueprint: definition.blueprint,
          objective: definition.objective,
        },
        definition,
      );
      const result = await dispatchTool(toolName, toolInput, {
        userId: definition.owner,
        missionId: definition.missionId,
        storeId: definition.storeId,
        req: ctx.req,
      });
      const output = result?.output ?? result ?? {};
      const ok = result?.status !== 'failed' && result?.status !== 'error';
      return {
        ok,
        data: normalizeToolOutput(output, toolName),
        error: ok ? undefined : { code: 'tool_failed', message: result?.error?.message ?? `${toolName} failed` },
      };
    },
    async validate(definition, ctx, generated) {
      return { ok: Boolean(generated && (generated.url || generated.previewUrl || generated.draft)), data: {} };
    },
    async publish(definition, ctx, generated) {
      return { ok: true, data: { published: false, requiresConfirmation: true, generated } };
    },
  });
}

export const PromotionGraphicAdapter = createToolDelegatingAdapter(
  'promotion_graphic',
  'create_promotion_graphic',
);

export const PosterAdapter = createToolDelegatingAdapter('poster', 'generate_poster');
export const SlideshowAdapter = createToolDelegatingAdapter('slideshow', 'generate_slideshow');
export const SocialPostAdapter = createToolDelegatingAdapter('social_post', 'generate_social_posts');
export const MenuAdapter = createToolDelegatingAdapter('menu', 'manage_menu_sync', { mode: 'validate' });
export const CatalogAdapter = createToolDelegatingAdapter('catalog', 'replace_store_catalog');

export const LoyaltyProgramAdapter = defineArtifactAdapter({
  type: 'loyalty_program',
  legacyTools: ['setup_loyalty_program', 'write_loyalty_program_from_mission'],
  async prepare(definition, ctx) {
    return { ok: true, data: { blueprint: definition.blueprint } };
  },
  async generate(definition, ctx) {
    const toolName = definition.context.toolName === 'write_loyalty_program_from_mission'
      ? 'write_loyalty_program_from_mission'
      : 'setup_loyalty_program';
    const result = await dispatchTool(
      toolName,
      buildToolDispatchEnvelope(definition.requiredInputs, definition),
      {
        userId: definition.owner,
        missionId: definition.missionId,
        storeId: definition.storeId,
        req: ctx.req,
      },
    );
    const output = result?.output ?? result ?? {};
    return {
      ok: result?.status !== 'failed',
      data: { ...output, draft: output.draft ?? output.program ?? output },
      error:
        result?.status === 'failed'
          ? { code: 'loyalty_failed', message: result?.error?.message ?? 'Loyalty setup failed' }
          : undefined,
    };
  },
});

export const StoreProfileAdapter = defineArtifactAdapter({
  type: 'store_profile',
  legacyTools: ['create_store'],
  async generate(definition, ctx) {
    const result = await dispatchTool(
      'create_store',
      buildToolDispatchEnvelope(definition.requiredInputs, definition),
      {
        userId: definition.owner,
        missionId: definition.missionId,
        storeId: definition.storeId,
        req: ctx.req,
      },
    );
    return {
      ok: result?.status !== 'failed',
      data: result?.output ?? {},
      error:
        result?.status === 'failed'
          ? { code: 'store_failed', message: result?.error?.message ?? 'Store creation failed' }
          : undefined,
    };
  },
});

export const WebsiteAdapter = defineArtifactAdapter({
  type: 'website',
  legacyTools: ['structured_store_build', 'create_store'],
  async generate(definition, ctx) {
    const toolName = definition.context.phase === 'build' ? 'structured_store_build' : 'create_store';
    const result = await dispatchTool(
      toolName,
      buildToolDispatchEnvelope(definition.requiredInputs, definition),
      {
        userId: definition.owner,
        missionId: definition.missionId,
        storeId: definition.storeId,
        req: ctx.req,
      },
    );
    return {
      ok: result?.status !== 'failed',
      data: result?.output ?? {},
      error:
        result?.status === 'failed'
          ? { code: 'website_failed', message: result?.error?.message ?? 'Website build failed' }
          : undefined,
    };
  },
});

export const PromotionVideoAdapter = defineArtifactAdapter({
  type: 'promotion_video',
  legacyTools: ['create_video', 'generate_video'],
  async prepare(definition, ctx) {
    return {
      ok: true,
      data: {
        factoryId: resolveCreativeFactoryId(),
        intent: definition.objective,
      },
    };
  },
  async generate(definition, ctx) {
    const factoryId = resolveCreativeFactoryId();
    if (!factoryId || !definition.missionId) {
      const fallback = await dispatchTool(
        'create_video',
        buildToolDispatchEnvelope(definition.requiredInputs, definition),
        {
          userId: definition.owner,
          missionId: definition.missionId,
          storeId: definition.storeId,
          req: ctx.req,
        },
      );
      return {
        ok: fallback?.status !== 'failed',
        data: normalizeToolOutput(fallback?.output ?? {}, 'create_video'),
        error:
          fallback?.status === 'failed'
            ? { code: 'video_failed', message: fallback?.error?.message ?? 'Video generation failed' }
            : undefined,
      };
    }

    const factoryResult = await runFactoryExecution({
      factoryId,
      missionId: definition.missionId,
      userId: definition.owner,
      intent: definition.objective,
      context: {
        ...definition.context,
        storeId: definition.storeId,
        assetKind: definition.type === 'slideshow' ? 'slideshow' : 'video',
        blueprint: definition.blueprint,
      },
      resumeState: ctx.execution?.factoryResumeState ?? null,
    });

    const awaiting =
      factoryResult.status === 'awaiting_factory_approval' ||
      factoryResult.status === 'awaiting_plan_approval' ||
      factoryResult.status === 'awaiting_final_asset_approval';

    return {
      ok: factoryResult.ok !== false && factoryResult.status !== 'failed',
      awaitingApproval: awaiting,
      data: {
        factoryExecution: factoryResult,
        status: factoryResult.status,
        artifacts: factoryResult.artifacts ?? null,
      },
      error:
        factoryResult.status === 'failed'
          ? factoryResult.error ?? { code: 'factory_failed', message: 'Creative factory failed' }
          : undefined,
    };
  },
});

/** Generic adapter for seeded types without bespoke logic yet */
export function createPlaceholderAdapter(type, toolName = null) {
  if (toolName) return createToolDelegatingAdapter(type, toolName);
  return defineArtifactAdapter({
    type,
    async generate(definition) {
      return {
        ok: true,
        data: {
          status: 'blueprint_only',
          message: `${type} adapter registered — generation delegates on next adapter pass`,
          blueprint: definition.blueprint,
        },
      };
    },
  });
}

/**
 * @param {unknown} output
 * @param {string} toolName
 */
function normalizeToolOutput(output, toolName) {
  if (!output || typeof output !== 'object') return { sourceTool: toolName, raw: output };
  const o = /** @type {Record<string, unknown>} */ (output);
  return {
    ...o,
    sourceTool: toolName,
    url: o.url ?? o.previewUrl ?? o.imageUrl ?? o.videoUrl ?? null,
    previewUrl: o.previewUrl ?? o.url ?? null,
    status: o.status ?? (o.url || o.previewUrl ? 'ready' : 'processing'),
  };
}
