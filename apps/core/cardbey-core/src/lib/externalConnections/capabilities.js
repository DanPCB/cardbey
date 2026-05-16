/**
 * Capability helpers — read-only checks against {@link PROVIDERS}.
 * Future pull tools: use same registry + OAuthConnection rows; do not add a second runtime.
 */

import { CONNECTION_KIND, EXTERNAL_CAPABILITY } from './types.js';
import { PROVIDERS } from './providers.js';

const PROVIDER_LIST = Object.values(PROVIDERS);

/**
 * Ordered channel keys for publish_to_social when `platforms` includes `all`.
 * Must match SHARE_URL_BUILDERS keys in publishToSocial.js.
 */
export const PUSH_SHARE_CHANNEL_KEYS = Object.freeze([
  'facebook',
  'instagram',
  'zalo',
  'whatsapp',
  'telegram',
  'twitter',
  'email',
]);

/**
 * @param {string} capability
 * @param {import('./types.js').CapabilityDirection} direction
 */
function providerHasCapability(descriptor, capability, direction) {
  return descriptor.capabilities.some((c) => c.capability === capability && c.direction === direction);
}

/** @param {string} providerId */
export function canProviderPull(providerId) {
  const d = PROVIDERS[providerId];
  if (!d) return false;
  return d.capabilities.some((c) => c.direction === 'pull');
}

/** @param {string} providerId */
export function canProviderPush(providerId) {
  const d = PROVIDERS[providerId];
  if (!d) return false;
  return d.capabilities.some((c) => c.direction === 'push');
}

/**
 * Capabilities for a provider (static registry). Later: merge with granted OAuth scopes if needed.
 * @param {string} providerId
 * @returns {ReadonlyArray<{ direction: import('./types.js').CapabilityDirection, capability: string }>}
 */
export function getProviderCapabilities(providerId) {
  const d = PROVIDERS[providerId];
  return d ? d.capabilities : [];
}

/**
 * Whether `connect_social_account` OAuth URL flow applies for this user-facing platform string.
 * @param {string} platform — lowercase tool input (e.g. facebook, instagram)
 */
export function supportsOAuthConnectForAlias(platform) {
  const p = String(platform ?? '').trim().toLowerCase();
  if (!p) return false;
  return PROVIDER_LIST.some(
    (d) =>
      d.connectionKind === CONNECTION_KIND.OAUTH_TOKEN &&
      d.oauthFamily === 'meta' &&
      Array.isArray(d.connectAliases) &&
      d.connectAliases.includes(p) &&
      providerHasCapability(d, EXTERNAL_CAPABILITY.OAUTH_CONNECT, 'push'),
  );
}

/**
 * Normalize publish channel key (handles x → twitter for share builders).
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizePublishChannelKey(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'x') return 'twitter';
  for (const d of PROVIDER_LIST) {
    if (d.publishChannelKey === s) return d.publishChannelKey;
    if (Array.isArray(d.connectAliases) && d.connectAliases.includes(s) && d.publishChannelKey) {
      return d.publishChannelKey;
    }
  }
  return s;
}

/**
 * Resolve registry provider id from connect alias (facebook → facebook_page).
 * @param {string} platform
 * @returns {string | null}
 */
export function resolveProviderIdFromConnectAlias(platform) {
  const p = String(platform ?? '').trim().toLowerCase();
  for (const d of PROVIDER_LIST) {
    if (Array.isArray(d.connectAliases) && d.connectAliases.includes(p)) return d.id;
  }
  return null;
}
