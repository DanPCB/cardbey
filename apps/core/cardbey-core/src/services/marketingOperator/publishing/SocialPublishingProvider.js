/**
 * SocialPublishingProvider interface (JSDoc contract).
 *
 * Implementations MUST:
 * - Never throw or log access tokens
 * - Support idempotency via idempotencyKey
 * - Return typed result objects (never invent live Meta verification)
 *
 * @typedef {object} PublishRequest
 * @property {string} contentId
 * @property {string|null} [pageId]
 * @property {string|null} [body]
 * @property {string} idempotencyKey
 * @property {Date|string} [scheduledAt]
 *
 * @typedef {object} PublishResult
 * @property {boolean} ok
 * @property {string} [code] e.g. CONFIG_REQUIRED | UNSUPPORTED | LIVE_DISABLED | IDEMPOTENT | MOCK_SUCCESS | MOCK_FAILURE
 * @property {string} [externalPostId]
 * @property {string} [publishedUrl]
 * @property {object} [meta] sanitised metadata only (no tokens)
 * @property {string} [message]
 *
 * @typedef {object} SocialPublishingProvider
 * @property {string} name
 * @property {(req: PublishRequest) => Promise<PublishResult>} publish
 * @property {(req: PublishRequest) => Promise<PublishResult>} schedule
 * @property {(args: { externalPostId: string, pageId?: string|null }) => Promise<PublishResult>} getStatus
 * @property {(args: { externalPostId: string, pageId?: string|null }) => Promise<PublishResult>} getMetrics
 */

export const PROVIDER_CODES = Object.freeze({
  CONFIG_REQUIRED: 'CONFIG_REQUIRED',
  LIVE_DISABLED: 'LIVE_DISABLED',
  UNSUPPORTED: 'UNSUPPORTED',
  IDEMPOTENT: 'IDEMPOTENT',
  MOCK_SUCCESS: 'MOCK_SUCCESS',
  MOCK_FAILURE: 'MOCK_FAILURE',
  PUBLISH_OK: 'PUBLISH_OK',
  SCHEDULE_OK: 'SCHEDULE_OK',
});

/** @type {SocialPublishingProvider} */
export const SocialPublishingProviderDocs = {
  name: 'interface',
  async publish() {
    return { ok: false, code: PROVIDER_CODES.UNSUPPORTED };
  },
  async schedule() {
    return { ok: false, code: PROVIDER_CODES.UNSUPPORTED };
  },
  async getStatus() {
    return { ok: false, code: PROVIDER_CODES.UNSUPPORTED };
  },
  async getMetrics() {
    return { ok: false, code: PROVIDER_CODES.UNSUPPORTED };
  },
};
