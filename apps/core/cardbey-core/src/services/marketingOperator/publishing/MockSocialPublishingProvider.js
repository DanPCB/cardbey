/**
 * Mock SocialPublishingProvider — success/failure modes, idempotent by key.
 * Never talks to Meta. Safe default for tests and local ops.
 */

import { PROVIDER_CODES } from './SocialPublishingProvider.js';

/** @type {Map<string, object>} */
const idempotencyStore = new Map();

export function resetMockPublishingStore() {
  idempotencyStore.clear();
}

/**
 * @param {{ mode?: 'success'|'failure' }} [options]
 */
export function createMockSocialPublishingProvider(options = {}) {
  const mode = options.mode || process.env.MARKETING_MOCK_PUBLISH_MODE || 'success';

  return {
    name: 'mock',

    /**
     * @param {import('./SocialPublishingProvider.js').PublishRequest} req
     */
    async publish(req) {
      const key = String(req.idempotencyKey || '');
      if (key && idempotencyStore.has(key)) {
        const prev = idempotencyStore.get(key);
        return { ...prev, code: PROVIDER_CODES.IDEMPOTENT, meta: { ...(prev.meta || {}), idempotent: true } };
      }

      if (mode === 'failure') {
        const result = {
          ok: false,
          code: PROVIDER_CODES.MOCK_FAILURE,
          message: 'Mock provider failure mode',
          meta: { mode },
        };
        if (key) idempotencyStore.set(key, result);
        return result;
      }

      const externalPostId = `mock_post_${key || Date.now()}`;
      const result = {
        ok: true,
        code: PROVIDER_CODES.MOCK_SUCCESS,
        externalPostId,
        publishedUrl: `https://www.facebook.com/mock/${externalPostId}`,
        meta: { mode: 'success', mock: true },
      };
      if (key) idempotencyStore.set(key, result);
      return result;
    },

    /**
     * @param {import('./SocialPublishingProvider.js').PublishRequest} req
     */
    async schedule(req) {
      const key = String(req.idempotencyKey || '');
      if (key && idempotencyStore.has(key)) {
        const prev = idempotencyStore.get(key);
        return { ...prev, code: PROVIDER_CODES.IDEMPOTENT, meta: { ...(prev.meta || {}), idempotent: true } };
      }
      if (mode === 'failure') {
        const result = { ok: false, code: PROVIDER_CODES.MOCK_FAILURE, meta: { mode } };
        if (key) idempotencyStore.set(key, result);
        return result;
      }
      const result = {
        ok: true,
        code: PROVIDER_CODES.SCHEDULE_OK,
        meta: { scheduledAt: req.scheduledAt || null, mock: true },
      };
      if (key) idempotencyStore.set(key, result);
      return result;
    },

    async getStatus({ externalPostId }) {
      return {
        ok: true,
        code: PROVIDER_CODES.MOCK_SUCCESS,
        externalPostId,
        meta: { status: 'published', mock: true },
      };
    },

    async getMetrics({ externalPostId }) {
      return {
        ok: true,
        code: PROVIDER_CODES.MOCK_SUCCESS,
        externalPostId,
        meta: { impressions: 0, engagement: 0, mock: true },
      };
    },
  };
}

export const MockSocialPublishingProvider = createMockSocialPublishingProvider();
