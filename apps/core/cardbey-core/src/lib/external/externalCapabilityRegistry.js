/**
 * External capability registry — provider id, env keys, health resolution, executor mapping.
 * Feeds GET /api/status/features and intake/provider hints (no secrets in responses).
 */

import {
  isVideoGenerationProviderAvailable,
  resolveVideoProvider,
  videoProviderUnavailableReason,
} from '../video/videoProvider.js';
import {
  getStorageConfig,
  isS3StorageEnabled,
  resolveStorageDriver,
} from '../storage/config.js';

/** @typedef {'video' | 'vision' | 'network' | 'content' | 'llm' | 'media' | 'storage' | 'translation'} ExternalCapabilityCategory */

/**
 * @typedef {{
 *   available: boolean;
 *   provider?: string | null;
 *   message?: string | null;
 *   driver?: string | null;
 *   sources?: string[];
 * }} CapabilityHealth
 */

/**
 * @typedef {{
 *   id: string;
 *   category: ExternalCapabilityCategory;
 *   label: string;
 *   envKeys: string[];
 *   executorTools: string[];
 *   featureKey?: string;
 *   costUnit?: 'token' | 'request' | 'second';
 *   resolve: (env?: NodeJS.ProcessEnv) => CapabilityHealth;
 * }} ExternalCapabilityEntry
 */

/** @type {ExternalCapabilityEntry[]} */
const EXTERNAL_CAPABILITIES = [
  {
    id: 'video.generation',
    category: 'video',
    label: 'Video generation',
    envKeys: [
      'VIDEO_GENERATION_PROVIDER',
      'KLING_ACCESS_KEY',
      'KLING_SECRET_KEY',
      'OPENAI_API_KEY',
      'VIDEO_ARTIFACT_MOCK_URL',
    ],
    executorTools: ['video_generate_multimodal'],
    featureKey: 'video',
    costUnit: 'second',
    resolve(env = process.env) {
      const available = isVideoGenerationProviderAvailable(env);
      return {
        available,
        provider: resolveVideoProvider(env) ?? 'none',
        message: available
          ? null
          : videoProviderUnavailableReason(env) ??
            'Requires video provider setup (OPENAI_API_KEY, Kling, or VIDEO_ARTIFACT_MOCK_URL)',
      };
    },
  },
  {
    id: 'network.cnet',
    category: 'network',
    label: 'C-Net integration',
    envKeys: ['CNET_API_KEY', 'CNET_ENDPOINT'],
    executorTools: ['deploy_to_cnet'],
    featureKey: 'cnet',
    costUnit: 'request',
    resolve(env = process.env) {
      const endpoint = (env.CNET_ENDPOINT || env.CNET_BASE_URL || '').trim();
      const available = Boolean(env.CNET_API_KEY?.trim()) && Boolean(endpoint);
      return {
        available,
        provider: available ? 'cnet' : 'none',
        message: available ? null : 'Requires CNET_API_KEY and CNET_ENDPOINT setup',
      };
    },
  },
  {
    id: 'vision.ocr',
    category: 'vision',
    label: 'OCR / card scan',
    envKeys: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
    executorTools: ['check_scan_capability', 'extract_card_data', 'create_product_from_card'],
    featureKey: 'ocr',
    costUnit: 'request',
    resolve(env = process.env) {
      const available =
        Boolean(env.OPENAI_API_KEY?.trim()) || Boolean(env.ANTHROPIC_API_KEY?.trim());
      return {
        available,
        message: available ? null : 'OCR requires OPENAI_API_KEY or ANTHROPIC_API_KEY',
      };
    },
  },
  {
    id: 'content.social',
    category: 'content',
    label: 'Social post generation',
    envKeys: [],
    executorTools: ['generate_social_posts'],
    featureKey: 'social',
    costUnit: 'token',
    resolve() {
      return { available: true, message: null };
    },
  },
  {
    id: 'llm.openai',
    category: 'llm',
    label: 'OpenAI LLM',
    envKeys: ['OPENAI_API_KEY', 'LLM_ENDPOINT'],
    executorTools: [],
    featureKey: 'llm',
    costUnit: 'token',
    resolve(env = process.env) {
      const openai = Boolean(env.OPENAI_API_KEY?.trim());
      const anthropic = Boolean(env.ANTHROPIC_API_KEY?.trim());
      const xai = Boolean(env.XAI_API_KEY?.trim());
      const groq = Boolean(env.GROQ_API_KEY?.trim());
      const available = openai || anthropic || xai || groq;
      const providers = [
        openai && 'openai',
        anthropic && 'anthropic',
        xai && 'xai',
        groq && 'groq',
      ].filter(Boolean);
      return {
        available,
        provider: providers[0] ?? 'none',
        sources: providers,
        message: available
          ? null
          : 'LLM requires at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY, GROQ_API_KEY',
      };
    },
  },
  {
    id: 'media.pexels',
    category: 'media',
    label: 'Pexels stock media',
    envKeys: ['PEXELS_API_KEY'],
    executorTools: [],
    featureKey: 'media',
    costUnit: 'request',
    resolve(env = process.env) {
      const pexels = Boolean(env.PEXELS_API_KEY?.trim());
      const pixabay = Boolean(env.PIXABAY_API_KEY?.trim());
      const brandfetch = Boolean(env.BRANDFETCH_API_KEY?.trim());
      const available = pexels || pixabay || brandfetch;
      const sources = [
        pexels && 'pexels',
        pixabay && 'pixabay',
        brandfetch && 'brandfetch',
      ].filter(Boolean);
      return {
        available,
        provider: sources[0] ?? 'none',
        sources,
        message: available
          ? null
          : 'Media search requires PEXELS_API_KEY, PIXABAY_API_KEY, or BRANDFETCH_API_KEY',
      };
    },
  },
  {
    id: 'storage.driver',
    category: 'storage',
    label: 'Media storage',
    envKeys: [
      'STORAGE_DRIVER',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'S3_ENDPOINT',
      'MEDIA_PUBLIC_BASE_URL',
    ],
    executorTools: [],
    featureKey: 'storage',
    costUnit: 'request',
    resolve(env = process.env) {
      const driver = resolveStorageDriver();
      if (driver === 'local') {
        return {
          available: true,
          driver: 'local',
          provider: 'local',
          message: null,
        };
      }
      const s3Ready = isS3StorageEnabled();
      const { bucket, publicBaseUrl } = getStorageConfig();
      return {
        available: s3Ready,
        driver: 's3',
        provider: s3Ready ? 's3' : 's3_misconfigured',
        message: s3Ready
          ? null
          : 'S3 storage requires S3_BUCKET, credentials, S3_ENDPOINT, and MEDIA_PUBLIC_BASE_URL',
        bucket: bucket ?? null,
        publicBaseUrl: publicBaseUrl ?? null,
      };
    },
  },
  {
    id: 'translation.llm',
    category: 'translation',
    label: 'Translation (LLM-backed)',
    envKeys: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'DEEPL_API_KEY'],
    executorTools: [],
    featureKey: 'translation',
    costUnit: 'token',
    resolve(env = process.env) {
      const deepl = Boolean(env.DEEPL_API_KEY?.trim());
      const llm =
        Boolean(env.ANTHROPIC_API_KEY?.trim()) ||
        Boolean(env.OPENAI_API_KEY?.trim()) ||
        Boolean(env.GROQ_API_KEY?.trim());
      const available = deepl || llm;
      const provider = deepl ? 'deepl' : llm ? 'llm' : 'none';
      return {
        available,
        provider,
        message: available
          ? null
          : 'Translation requires DEEPL_API_KEY or an LLM key (ANTHROPIC/OPENAI/GROQ)',
      };
    },
  },
];

/** @type {Map<string, ExternalCapabilityEntry>} */
const BY_ID = new Map(EXTERNAL_CAPABILITIES.map((entry) => [entry.id, entry]));

/**
 * @returns {ExternalCapabilityEntry[]}
 */
export function listExternalCapabilities() {
  return [...EXTERNAL_CAPABILITIES];
}

/**
 * @param {string} id
 * @returns {ExternalCapabilityEntry | undefined}
 */
export function getExternalCapability(id) {
  return BY_ID.get(String(id ?? '').trim());
}

/**
 * Legacy feature map consumed by dashboard FeatureBadge (video, cnet, ocr, social).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, CapabilityHealth>}
 */
export function buildLegacyFeatureStatus(env = process.env) {
  /** @type {Record<string, CapabilityHealth>} */
  const features = {};
  for (const entry of EXTERNAL_CAPABILITIES) {
    if (!entry.featureKey) continue;
    features[entry.featureKey] = entry.resolve(env);
  }
  return features;
}

/**
 * Full capability status list (id, category, health, executor mapping).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function buildExternalCapabilityStatus(env = process.env) {
  return EXTERNAL_CAPABILITIES.map((entry) => {
    const health = entry.resolve(env);
    return {
      id: entry.id,
      category: entry.category,
      label: entry.label,
      envKeys: entry.envKeys,
      executorTools: entry.executorTools,
      costUnit: entry.costUnit ?? null,
      featureKey: entry.featureKey ?? null,
      ...health,
    };
  });
}

/**
 * Register additional capabilities at runtime (tests / future plugin loader).
 * @param {ExternalCapabilityEntry} entry
 */
export function registerExternalCapability(entry) {
  if (!entry?.id) return;
  const existing = BY_ID.get(entry.id);
  if (existing) {
    const idx = EXTERNAL_CAPABILITIES.indexOf(existing);
    if (idx >= 0) EXTERNAL_CAPABILITIES.splice(idx, 1, entry);
  } else {
    EXTERNAL_CAPABILITIES.push(entry);
  }
  BY_ID.set(entry.id, entry);
}

export { EXTERNAL_CAPABILITIES };
