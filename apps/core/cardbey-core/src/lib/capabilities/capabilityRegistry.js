/**
 * Explicit operational capability registry (rule-based; no LLM planner).
 * Maps user-facing capabilities → tools, providers, fallbacks, artifact types.
 */

import { isSlideshowGenerationProviderAvailable } from '../artifacts/slideshowArtifactContract.js';
import { isVideoGenerationProviderAvailable } from '../video/videoArtifactContract.js';

/** @typedef {'promo_video' | 'slideshow' | 'promo_image' | 'promo_poster' | 'social_posts' | 'offer' | 'qr_campaign' | 'store_website' | 'unknown'} OperationalCapability */

/**
 * @typedef {Object} CapabilityRegistryEntry
 * @property {OperationalCapability} capability
 * @property {string[]} primaryTools
 * @property {string[]} fallbackTools
 * @property {string[]} requiredContext
 * @property {string[]} artifactTypes
 * @property {string[]} [providerEnv]
 * @property {string} userFacingName
 */

/** @type {Record<OperationalCapability, CapabilityRegistryEntry>} */
export const CAPABILITY_REGISTRY = {
  promo_video: {
    capability: 'promo_video',
    primaryTools: ['video_generate_multimodal'],
    fallbackTools: ['generate_slideshow', 'generate_poster'],
    requiredContext: ['storeId'],
    artifactTypes: ['video', 'slideshow', 'image'],
    providerEnv: ['VIDEO_GENERATION_PROVIDER'],
    userFacingName: 'promotional video',
  },
  slideshow: {
    capability: 'slideshow',
    primaryTools: ['generate_slideshow'],
    fallbackTools: ['generate_poster'],
    requiredContext: ['storeId'],
    artifactTypes: ['slideshow', 'image'],
    providerEnv: ['SLIDESHOW_GENERATION_PROVIDER'],
    userFacingName: 'slideshow',
  },
  promo_image: {
    capability: 'promo_image',
    primaryTools: ['smart_visual'],
    fallbackTools: ['generate_poster'],
    requiredContext: ['storeId'],
    artifactTypes: ['image'],
    providerEnv: [],
    userFacingName: 'promotional image',
  },
  promo_poster: {
    capability: 'promo_poster',
    primaryTools: ['generate_poster'],
    fallbackTools: [],
    requiredContext: ['storeId'],
    artifactTypes: ['image'],
    providerEnv: [],
    userFacingName: 'promotional poster',
  },
  social_posts: {
    capability: 'social_posts',
    primaryTools: ['generate_social_posts'],
    fallbackTools: ['content_creator'],
    requiredContext: ['storeId'],
    artifactTypes: ['text_asset'],
    providerEnv: [],
    userFacingName: 'social posts',
  },
  offer: {
    capability: 'offer',
    primaryTools: ['create_offer'],
    fallbackTools: [],
    requiredContext: ['storeId'],
    artifactTypes: ['campaign'],
    providerEnv: [],
    userFacingName: 'offer',
  },
  qr_campaign: {
    capability: 'qr_campaign',
    primaryTools: ['generate_promotion_asset'],
    fallbackTools: [],
    requiredContext: ['storeId'],
    artifactTypes: ['qr', 'campaign'],
    providerEnv: [],
    userFacingName: 'QR campaign',
  },
  store_website: {
    capability: 'store_website',
    primaryTools: ['structured_store_build', 'create_store'],
    fallbackTools: [],
    requiredContext: [],
    artifactTypes: ['store'],
    providerEnv: [],
    userFacingName: 'store website',
  },
  unknown: {
    capability: 'unknown',
    primaryTools: [],
    fallbackTools: [],
    requiredContext: [],
    artifactTypes: ['unknown'],
    providerEnv: [],
    userFacingName: 'request',
  },
};

/** @type {Record<string, { label: string; prompt: string; artifactType: string; description: string }>} */
export const FALLBACK_TOOL_META = {
  generate_slideshow: {
    label: 'Create slideshow promo',
    prompt: 'Create a slideshow promotional video for my store',
    artifactType: 'slideshow',
    description: 'build a slideshow promo from your store images and copy',
  },
  generate_poster: {
    label: 'Create promo poster',
    prompt: 'Create a promotional poster for my store',
    artifactType: 'image',
    description: 'design a static promotional poster from your store branding',
  },
  smart_visual: {
    label: 'Generate promo image',
    prompt: 'Create a promotional image for my store',
    artifactType: 'image',
    description: 'generate a still promotional image',
  },
  content_creator: {
    label: 'Draft campaign copy',
    prompt: 'Write promotional copy and social captions for my store',
    artifactType: 'text_asset',
    description: 'draft promotional copy and captions (mission pipeline)',
  },
};

const RE_PROMO_VIDEO =
  /\b(promo(tional)?\s+video|promotion\s+video|marketing\s+video|video\s+ad|video\s+clip|reel|tiktok|short\s+video|ai\s+video)\b/i;
const RE_SLIDESHOW = /\b(slideshow|slide\s*show|carousel\s+video|photo\s+slideshow)\b/i;
const RE_POSTER = /\b(poster|flyer|print\s+ad)\b/i;
const RE_SOCIAL = /\b(social\s+post|instagram\s+caption|facebook\s+post|caption)\b/i;

/**
 * @param {string} toolName
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ available: boolean; reason?: string }}
 */
export function isToolProviderAvailable(toolName, env = process.env) {
  const t = String(toolName ?? '').trim();
  if (t === 'video_generate_multimodal') {
    if (isVideoGenerationProviderAvailable()) return { available: true };
    return {
      available: false,
      reason: 'Direct AI video is not connected yet (set VIDEO_GENERATION_PROVIDER).',
    };
  }
  if (t === 'generate_slideshow') {
    if (isSlideshowGenerationProviderAvailable()) return { available: true };
    return {
      available: false,
      reason: 'Slideshow generation is not connected on the server yet (set SLIDESHOW_GENERATION_PROVIDER).',
    };
  }
  if (t === 'generate_poster') {
    return { available: true };
  }
  if (t === 'smart_visual' || t === 'generate_promotion_asset' || t === 'generate_social_posts' || t === 'create_offer') {
    return {
      available: false,
      reason: 'This capability is not fully connected yet.',
    };
  }
  if (t === 'content_creator') {
    return {
      available: false,
      reason: 'Campaign copy runs through a mission pipeline, not as a direct artifact yet.',
    };
  }
  return { available: false, reason: 'Tool is not available for direct execution.' };
}

/**
 * @param {OperationalCapability} capability
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isCapabilityProviderAvailable(capability, env = process.env) {
  const entry = getCapabilityPlan(capability);
  if (!entry?.primaryTools?.length) return { available: false, reason: 'Unknown capability.' };
  const primary = entry.primaryTools[0];
  return isToolProviderAvailable(primary, env);
}

/**
 * @param {OperationalCapability | string} capability
 * @returns {CapabilityRegistryEntry | null}
 */
export function getCapabilityPlan(capability) {
  const key = String(capability ?? 'unknown').trim();
  return CAPABILITY_REGISTRY[key] ?? CAPABILITY_REGISTRY.unknown;
}

/**
 * @param {OperationalCapability | string} capability
 * @returns {string[]}
 */
export function getFallbackTools(capability) {
  return getCapabilityPlan(capability)?.fallbackTools ?? [];
}

/**
 * @param {string} message
 * @param {string[]} [candidateTools]
 * @param {Record<string, unknown>} [context]
 * @returns {OperationalCapability}
 */
export function resolveRequestedCapability(message, candidateTools = [], context = {}) {
  const tools = (candidateTools ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (tools.includes('video_generate_multimodal') || RE_PROMO_VIDEO.test(String(message ?? ''))) {
    return 'promo_video';
  }
  if (tools.includes('generate_slideshow') || RE_SLIDESHOW.test(String(message ?? ''))) {
    return 'slideshow';
  }
  if (tools.includes('generate_poster') || RE_POSTER.test(String(message ?? ''))) {
    return 'promo_poster';
  }
  if (tools.includes('generate_social_posts') || RE_SOCIAL.test(String(message ?? ''))) {
    return 'social_posts';
  }
  if (tools.includes('smart_visual')) return 'promo_image';
  if (tools.includes('create_offer')) return 'offer';
  if (tools.includes('generate_promotion_asset')) return 'qr_campaign';
  if (tools.includes('structured_store_build') || tools.includes('create_store')) return 'store_website';
  return 'unknown';
}

/**
 * @param {OperationalCapability} capability
 * @param {string} unavailableReason
 * @param {string} fallbackTool
 */
export function explainCapabilityFallback(capability, unavailableReason, fallbackTool) {
  const meta = FALLBACK_TOOL_META[fallbackTool];
  const name = getCapabilityPlan(capability)?.userFacingName ?? 'this request';
  if (!meta) {
    return `Direct ${name} is not available. Try another option.`;
  }
  const lead = unavailableReason?.trim() || `Direct ${name} is not connected yet.`;
  return `${lead} I can ${meta.description} instead.`;
}
