/**
 * Provider registry — single source of truth for provider identity, labels, and capability intent.
 *
 * `prismaOAuthPlatform` MUST match `OAuthConnection.platform` strings already persisted (do not rename lightly).
 * `publishChannelKey` aligns with `publish_to_social` / share-link builders (executor channel keys).
 */

import { CONNECTION_KIND, EXTERNAL_CAPABILITY } from './types.js';

/**
 * @typedef {object} ProviderCapabilityEntry
 * @property {import('./types.js').CapabilityDirection} direction
 * @property {string} capability — EXTERNAL_CAPABILITY.*
 */

/**
 * @typedef {object} ExternalProviderDescriptor
 * @property {string} id — stable snake_case id (e.g. facebook_page)
 * @property {string} label
 * @property {string} connectionKind — CONNECTION_KIND.*
 * @property {string} [oauthFamily] — e.g. meta
 * @property {string} [prismaOAuthPlatform] — stored on OAuthConnection.platform when OAuth-backed
 * @property {string[]} [connectAliases] — tool/API user strings → this provider (e.g. facebook, instagram)
 * @property {string} [publishChannelKey] — key for share-link / publish_to_social channel map
 * @property {ProviderCapabilityEntry[]} capabilities
 */

/** @type {Record<string, ExternalProviderDescriptor>} */
export const PROVIDERS = Object.freeze({
  facebook_page: {
    id: 'facebook_page',
    label: 'Facebook Page',
    connectionKind: CONNECTION_KIND.OAUTH_TOKEN,
    oauthFamily: 'meta',
    prismaOAuthPlatform: 'facebook',
    connectAliases: ['facebook'],
    publishChannelKey: 'facebook',
    capabilities: [
      { direction: 'push', capability: EXTERNAL_CAPABILITY.OAUTH_CONNECT },
      { direction: 'push', capability: EXTERNAL_CAPABILITY.PUBLISH_CAMPAIGN },
      { direction: 'push', capability: EXTERNAL_CAPABILITY.SHARE_LINK },
      { direction: 'pull', capability: EXTERNAL_CAPABILITY.IMPORT_BUSINESS_PROFILE },
      { direction: 'pull', capability: EXTERNAL_CAPABILITY.FETCH_EXTERNAL_PREVIEW },
    ],
  },
  instagram_business: {
    id: 'instagram_business',
    label: 'Instagram (business)',
    connectionKind: CONNECTION_KIND.OAUTH_TOKEN,
    oauthFamily: 'meta',
    prismaOAuthPlatform: 'instagram',
    connectAliases: ['instagram'],
    publishChannelKey: 'instagram',
    capabilities: [
      { direction: 'push', capability: EXTERNAL_CAPABILITY.OAUTH_CONNECT },
      { direction: 'push', capability: EXTERNAL_CAPABILITY.SHARE_LINK },
      { direction: 'pull', capability: EXTERNAL_CAPABILITY.IMPORT_BUSINESS_PROFILE },
      { direction: 'pull', capability: EXTERNAL_CAPABILITY.FETCH_EXTERNAL_PREVIEW },
    ],
  },
  website: {
    id: 'website',
    label: 'Website',
    connectionKind: CONNECTION_KIND.URL_SOURCE,
    publishChannelKey: undefined,
    capabilities: [
      { direction: 'pull', capability: EXTERNAL_CAPABILITY.IMPORT_BUSINESS_PROFILE },
      { direction: 'pull', capability: EXTERNAL_CAPABILITY.IMPORT_CATALOG },
      { direction: 'pull', capability: EXTERNAL_CAPABILITY.FETCH_EXTERNAL_PREVIEW },
      { direction: 'pull', capability: EXTERNAL_CAPABILITY.APPLY_TO_DRAFT },
    ],
  },
  zalo: {
    id: 'zalo',
    label: 'Zalo',
    connectionKind: CONNECTION_KIND.MANUAL,
    publishChannelKey: 'zalo',
    capabilities: [
      { direction: 'push', capability: EXTERNAL_CAPABILITY.SHARE_LINK },
    ],
  },
  whatsapp: {
    id: 'whatsapp',
    label: 'WhatsApp',
    connectionKind: CONNECTION_KIND.MANUAL,
    publishChannelKey: 'whatsapp',
    capabilities: [{ direction: 'push', capability: EXTERNAL_CAPABILITY.SHARE_LINK }],
  },
  telegram: {
    id: 'telegram',
    label: 'Telegram',
    connectionKind: CONNECTION_KIND.MANUAL,
    publishChannelKey: 'telegram',
    capabilities: [{ direction: 'push', capability: EXTERNAL_CAPABILITY.SHARE_LINK }],
  },
  x: {
    id: 'x',
    label: 'X (Twitter)',
    connectionKind: CONNECTION_KIND.MANUAL,
    publishChannelKey: 'twitter',
    connectAliases: ['twitter', 'x'],
    capabilities: [{ direction: 'push', capability: EXTERNAL_CAPABILITY.SHARE_LINK }],
  },
  email: {
    id: 'email',
    label: 'Email',
    connectionKind: CONNECTION_KIND.MANUAL,
    publishChannelKey: 'email',
    capabilities: [{ direction: 'push', capability: EXTERNAL_CAPABILITY.SHARE_LINK }],
  },
});

/** Prisma `OAuthConnection.platform` values written by current Meta OAuth callback (push). */
export const PRISMA_OAUTH_PLATFORM = Object.freeze({
  FACEBOOK: PROVIDERS.facebook_page.prismaOAuthPlatform,
  INSTAGRAM: PROVIDERS.instagram_business.prismaOAuthPlatform,
});
