/**
 * External Connections — shared provider + capability layer for pull (ingest) and push (distribute).
 *
 * - OAuth tokens: Prisma OAuthConnection + tokenCrypto; callbacks stay in routes.
 * - Tools: connect_social_account, publish_to_social (push); future connect_external_source / fetch_* (pull).
 */

export {
  EXTERNAL_CAPABILITY,
  CONNECTION_KIND,
} from './types.js';

export { PROVIDERS, PRISMA_OAUTH_PLATFORM } from './providers.js';

export {
  PUSH_SHARE_CHANNEL_KEYS,
  canProviderPull,
  canProviderPush,
  getProviderCapabilities,
  supportsOAuthConnectForAlias,
  normalizePublishChannelKey,
  resolveProviderIdFromConnectAlias,
} from './capabilities.js';
