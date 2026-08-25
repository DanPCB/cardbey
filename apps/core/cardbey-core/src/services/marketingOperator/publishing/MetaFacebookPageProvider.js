/**
 * Meta Facebook Page publishing scaffold — official Graph API only.
 * Live path is fail-closed unless ENABLE_FACEBOOK_LIVE_PUBLISHING_V1 + creds.
 * Never throws or returns access tokens.
 */

import { Features } from '../../../config/features.js';
import { getMetaGraphApiVersion } from '../constants.js';
import { PROVIDER_CODES } from './SocialPublishingProvider.js';

/**
 * Resolve page id without exposing tokens.
 * Page token preferably via OAuthConnection at call site — this provider only
 * reads env page id override and never logs credentials.
 */
function resolvePageId(reqPageId) {
  return (
    (reqPageId && String(reqPageId).trim()) ||
    String(process.env.CARDBEY_FACEBOOK_PAGE_ID || '').trim() ||
    null
  );
}

function livePublishingAllowed() {
  return Features.marketingOperator.livePublishingV1 === true;
}

function facebookProviderEnabled() {
  return Features.marketingOperator.facebookProviderV1 === true;
}

/**
 * Credentials check — presence only, never return secret values.
 * Page access tokens should come from OAuthConnection (encrypted at rest).
 * Optional env override names listed for ops; values are never returned.
 */
function hasConfiguredCredentials() {
  const pageId = String(process.env.CARDBEY_FACEBOOK_PAGE_ID || '').trim();
  // Intentionally do not read raw page tokens from env into results.
  // Caller may inject a short-lived token via internal opts in future; not used when live off.
  return Boolean(pageId);
}

/**
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {() => Promise<string|null>} [opts.resolvePageAccessToken] — must never log return value
 */
export function createMetaFacebookPageProvider(opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const resolvePageAccessToken = opts.resolvePageAccessToken || (async () => null);

  return {
    name: 'meta_facebook_page',

    /**
     * @param {import('./SocialPublishingProvider.js').PublishRequest} req
     */
    async publish(req) {
      if (!facebookProviderEnabled()) {
        return {
          ok: false,
          code: PROVIDER_CODES.CONFIG_REQUIRED,
          message: 'ENABLE_FACEBOOK_MARKETING_PROVIDER_V1 is false',
          meta: { providerEnabled: false },
        };
      }
      if (!livePublishingAllowed()) {
        return {
          ok: false,
          code: PROVIDER_CODES.LIVE_DISABLED,
          message: 'Live Facebook publishing is disabled (ENABLE_FACEBOOK_LIVE_PUBLISHING_V1=false)',
          meta: { livePublishingV1: false },
        };
      }

      const pageId = resolvePageId(req.pageId);
      if (!pageId || !hasConfiguredCredentials()) {
        return {
          ok: false,
          code: PROVIDER_CODES.CONFIG_REQUIRED,
          message: 'CARDBEY_FACEBOOK_PAGE_ID (or request pageId) required',
          meta: { pageIdPresent: Boolean(pageId) },
        };
      }

      let token = null;
      try {
        token = await resolvePageAccessToken();
      } catch {
        token = null;
      }
      if (!token) {
        return {
          ok: false,
          code: PROVIDER_CODES.CONFIG_REQUIRED,
          message: 'Page access token unavailable via OAuthConnection resolver',
          meta: { tokenPresent: false, pageIdPresent: true },
        };
      }

      const version = getMetaGraphApiVersion();
      const url = `https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}/feed`;

      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: String(req.body || ''),
            access_token: token,
          }),
        });
        // Drop token reference ASAP
        token = null;
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            ok: false,
            code: 'GRAPH_ERROR',
            message: 'Graph API publish failed',
            meta: {
              httpStatus: res.status,
              graphErrorCode: data?.error?.code ?? null,
              // Never include data.error.message if it could echo tokens — keep code only
            },
          };
        }
        const externalPostId = data?.id ? String(data.id) : null;
        return {
          ok: true,
          code: PROVIDER_CODES.PUBLISH_OK,
          externalPostId,
          publishedUrl: externalPostId
            ? `https://www.facebook.com/${externalPostId}`
            : null,
          meta: { graphVersion: version },
        };
      } catch (err) {
        token = null;
        return {
          ok: false,
          code: 'NETWORK_ERROR',
          message: 'Graph request failed',
          meta: { errorName: err?.name || 'Error' },
        };
      }
    },

    /**
     * @param {import('./SocialPublishingProvider.js').PublishRequest} req
     */
    async schedule(req) {
      if (!livePublishingAllowed()) {
        return {
          ok: false,
          code: PROVIDER_CODES.LIVE_DISABLED,
          message: 'Live scheduling disabled',
          meta: { livePublishingV1: false },
        };
      }
      // Graph scheduled posts require published=false + scheduled_publish_time — scaffold only.
      return {
        ok: false,
        code: PROVIDER_CODES.UNSUPPORTED,
        message: 'Meta schedule scaffold — not live-verified; use mock provider until verified',
        meta: { scheduledAt: req.scheduledAt || null },
      };
    },

    async getStatus() {
      if (!livePublishingAllowed()) {
        return { ok: false, code: PROVIDER_CODES.LIVE_DISABLED, meta: {} };
      }
      return {
        ok: false,
        code: PROVIDER_CODES.UNSUPPORTED,
        message: 'Status polling not live-verified',
        meta: {},
      };
    },

    async getMetrics() {
      if (!livePublishingAllowed()) {
        return { ok: false, code: PROVIDER_CODES.LIVE_DISABLED, meta: {} };
      }
      return {
        ok: false,
        code: PROVIDER_CODES.UNSUPPORTED,
        message: 'Insights metrics not live-verified',
        meta: {},
      };
    },
  };
}

export const MetaFacebookPageProvider = createMetaFacebookPageProvider();
