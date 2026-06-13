/**
 * Factory Runtime bootstrap — register stage handlers and intent mappings.
 * New factories extend this module; executor stays factory-agnostic.
 */

import { registerFactoryStageHandler } from './factoryStageHandlerRegistry.js';
import { registerFactoryIntent } from './factoryIntentRegistry.js';
import {
  CREATIVE_ASSET_FACTORY_V1_ID,
  CREATIVE_ASSET_FACTORY_V2_ID,
  CREATIVE_ASSET_FACTORY_V3_ID,
  CREATIVE_ASSET_FACTORY_V4_ID,
  CAMPAIGN_PACKAGE_FACTORY_V1_ID,
} from './factoryConstants.js';

const CREATIVE_VIDEO_LABELS = [
  'create_video',
  'generate_video',
  'make_video',
  'video_for_store',
  'store_video',
  'video_content',
  'promotional_video',
  'product_video',
  'social_media_video',
  'creative_asset',
  'ad_video',
  'create_creative_asset',
];

const CREATIVE_VIDEO_REGEX = [
  /\b(create|make|generate|build|produce)\b.*\b(promotional?|promotion|marketing|product|social\s*media|ad)\s+video\b/,
  /\b(create|make|generate)\b.*\bcreative\s+asset\b/,
  /\bmake\b.*\b(ad|advert)\s+video\b/,
  /\bmake\b.*\bvideo\b.*\b(for|my)\b.*\bstore\b/,
  /\b(create|make|generate)\b.*\bvideo\b.*\b(for|my)\b.*\bstore\b/,
  /\bpromotional?\s+video\b/,
];

export function isCreativeFactoryV1Enabled() {
  const raw = process.env.ENABLE_CREATIVE_FACTORY_V1;
  if (raw === 'false' || raw === '0') return false;
  return true;
}

export function isCreativeFactoryV2Enabled() {
  const raw = process.env.ENABLE_CREATIVE_FACTORY_V2;
  return raw === 'true' || raw === '1';
}

export function isCreativeFactoryV3Enabled() {
  const raw = process.env.ENABLE_CREATIVE_FACTORY_V3;
  return raw === 'true' || raw === '1';
}

export function isCreativeFactoryV4Enabled() {
  const raw = process.env.ENABLE_CREATIVE_FACTORY_V4;
  return raw === 'true' || raw === '1';
}

export function isCampaignPackageFactoryEnabled() {
  const raw = process.env.ENABLE_CAMPAIGN_PACKAGE_FACTORY;
  return raw === 'true' || raw === '1';
}

export function resolveCreativeFactoryId() {
  if (isCreativeFactoryV4Enabled()) return CREATIVE_ASSET_FACTORY_V4_ID;
  if (isCreativeFactoryV3Enabled()) return CREATIVE_ASSET_FACTORY_V3_ID;
  if (isCreativeFactoryV2Enabled()) return CREATIVE_ASSET_FACTORY_V2_ID;
  if (isCreativeFactoryV1Enabled()) return CREATIVE_ASSET_FACTORY_V1_ID;
  return null;
}

function createLazyV2StageHandler() {
  return async (stage, state, definition, ownedCtx) => {
    const { runCreativeFactoryV2BuiltinStage } = await import('./creativeFactoryV2Stages.js');
    return runCreativeFactoryV2BuiltinStage(stage, state, definition, ownedCtx);
  };
}

function registerCreativeV2StageHandlers() {
  const handler = createLazyV2StageHandler();
  for (const stageId of ['research', 'script', 'asset_search', 'video_plan']) {
    registerFactoryStageHandler(CREATIVE_ASSET_FACTORY_V2_ID, stageId, handler);
    registerFactoryStageHandler(CREATIVE_ASSET_FACTORY_V3_ID, stageId, handler);
    registerFactoryStageHandler(CREATIVE_ASSET_FACTORY_V4_ID, stageId, handler);
  }
}

function createLazyV3StageHandler() {
  return async (stage, state, definition, ownedCtx) => {
    const { runCreativeFactoryV3BuiltinStage } = await import('./creativeFactoryV3Stages.js');
    return runCreativeFactoryV3BuiltinStage(stage, state, definition, ownedCtx);
  };
}

function registerCreativeV3StageHandlers() {
  const handler = createLazyV3StageHandler();
  for (const stageId of ['subtitle', 'music_selection', 'publish_handoff']) {
    registerFactoryStageHandler(CREATIVE_ASSET_FACTORY_V3_ID, stageId, handler);
  }
}

function createLazyV4StageHandler() {
  return async (stage, state, definition, ownedCtx) => {
    const { runCreativeFactoryV4BuiltinStage } = await import('./creativeFactoryV4Stages.js');
    return runCreativeFactoryV4BuiltinStage(stage, state, definition, ownedCtx);
  };
}

function registerCreativeV4StageHandlers() {
  const handler = createLazyV4StageHandler();
  for (const stageId of [
    'scene_binding',
    'multi_scene_render',
    'subtitle_burn_optional',
    'music_selection',
    'publish_handoff',
  ]) {
    registerFactoryStageHandler(CREATIVE_ASSET_FACTORY_V4_ID, stageId, handler);
  }
}

function registerFactoryIntents() {
  registerFactoryIntent({
    id: 'creative_video',
    capability: 'creative_video',
    priority: 100,
    flag: 'ENABLE_CREATIVE_FACTORY_V1',
    patterns: { labels: CREATIVE_VIDEO_LABELS, regex: CREATIVE_VIDEO_REGEX },
    resolveFactoryId: () => resolveCreativeFactoryId(),
  });

  registerFactoryIntent({
    id: 'campaign_package',
    factoryId: CAMPAIGN_PACKAGE_FACTORY_V1_ID,
    capability: 'campaign_package',
    priority: 80,
    flag: 'ENABLE_CAMPAIGN_PACKAGE_FACTORY',
    patterns: {
      labels: ['campaign_package', 'create_campaign_package', 'package_campaign'],
      regex: [/\b(create|build|package)\b.*\bcampaign\s+package\b/i, /\bcampaign\s+package\b/i],
    },
  });
}

let bootstrapped = false;

export function bootstrapFactoryRuntime() {
  if (bootstrapped) return;
  bootstrapped = true;
  registerCreativeV2StageHandlers();
  registerCreativeV3StageHandlers();
  registerCreativeV4StageHandlers();
  registerFactoryIntents();
}
