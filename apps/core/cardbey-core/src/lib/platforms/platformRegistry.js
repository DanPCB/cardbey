/**
 * Platform Registry — supported social and LLM connection targets.
 * Static metadata for connection UI and platformService routing.
 */

/** @typedef {'oauth'|'api_key'|'bot_token'|'webhook'} PlatformAuthType */

/**
 * @typedef {object} PlatformDescriptor
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string} color
 * @property {string[]} capabilities
 * @property {PlatformAuthType} authType
 * @property {string} [authUrl]
 * @property {string} [statusUrl]
 * @property {string} [revokeUrl]
 * @property {string} [docUrl]
 * @property {string[]} requires
 * @property {string} [oauthPlatform] — OAuthConnection.platform when OAuth-backed
 * @property {'social'|'llm'} category
 */

/** @type {Record<string, PlatformDescriptor>} */
export const SOCIAL_PLATFORMS = Object.freeze({
  facebook: {
    id: 'facebook',
    name: 'Facebook Page',
    icon: '📘',
    color: '#1877F2',
    capabilities: ['post', 'publish_campaign', 'share_link'],
    authType: 'oauth',
    authUrl: '/api/oauth/facebook/connect',
    statusUrl: '/api/platforms/facebook/status',
    revokeUrl: '/api/platforms/facebook/disconnect',
    docUrl: 'https://developers.facebook.com/docs/graph-api',
    requires: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_REDIRECT_URI'],
    oauthPlatform: 'facebook',
    category: 'social',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram Business',
    icon: '📸',
    color: '#E4405F',
    capabilities: ['post', 'publish_campaign', 'share_link'],
    authType: 'oauth',
    authUrl: '/api/oauth/instagram/connect',
    statusUrl: '/api/platforms/instagram/status',
    revokeUrl: '/api/platforms/instagram/disconnect',
    docUrl: 'https://developers.facebook.com/docs/instagram-api',
    requires: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_REDIRECT_URI'],
    oauthPlatform: 'instagram',
    category: 'social',
  },
  zalo: {
    id: 'zalo',
    name: 'Zalo Official Account',
    icon: '💙',
    color: '#0068FF',
    capabilities: ['post', 'publish_campaign', 'share_link'],
    authType: 'oauth',
    authUrl: '/api/oauth/zalo/connect',
    statusUrl: '/api/platforms/zalo/status',
    revokeUrl: '/api/platforms/zalo/disconnect',
    docUrl: 'https://developers.zalo.me/docs',
    requires: ['ZALO_APP_ID', 'ZALO_APP_SECRET', 'ZALO_REDIRECT_URI'],
    oauthPlatform: 'zalo',
    category: 'social',
  },
  twitter: {
    id: 'twitter',
    name: 'Twitter/X',
    icon: '🐦',
    color: '#1DA1F2',
    capabilities: ['post', 'read', 'hashtag_search'],
    authType: 'oauth',
    authUrl: '/api/oauth/twitter/connect',
    statusUrl: '/api/platforms/twitter/status',
    revokeUrl: '/api/platforms/twitter/disconnect',
    docUrl: 'https://developer.twitter.com/en/docs',
    requires: ['TWITTER_API_KEY', 'TWITTER_API_SECRET'],
    oauthPlatform: 'twitter',
    category: 'social',
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '🔗',
    color: '#0A66C2',
    capabilities: ['post', 'read', 'company_pages'],
    authType: 'oauth',
    authUrl: '/api/oauth/linkedin/connect',
    statusUrl: '/api/platforms/linkedin/status',
    revokeUrl: '/api/platforms/linkedin/disconnect',
    docUrl: 'https://learn.microsoft.com/en-us/linkedin/',
    requires: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    oauthPlatform: 'linkedin',
    category: 'social',
  },
  reddit: {
    id: 'reddit',
    name: 'Reddit',
    icon: '🔴',
    color: '#FF4500',
    capabilities: ['post', 'read', 'subreddit_search'],
    authType: 'oauth',
    authUrl: '/api/oauth/reddit/connect',
    statusUrl: '/api/platforms/reddit/status',
    revokeUrl: '/api/platforms/reddit/disconnect',
    docUrl: 'https://www.reddit.com/dev/api/',
    requires: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
    oauthPlatform: 'reddit',
    category: 'social',
  },
  telegram: {
    id: 'telegram',
    name: 'Telegram',
    icon: '💬',
    color: '#0088CC',
    capabilities: ['post', 'read', 'bot_commands'],
    authType: 'bot_token',
    authUrl: '/api/platforms/telegram/connect',
    statusUrl: '/api/platforms/telegram/status',
    revokeUrl: '/api/platforms/telegram/disconnect',
    docUrl: 'https://core.telegram.org/bots/tutorial',
    requires: ['TELEGRAM_BOT_TOKEN'],
    category: 'social',
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    icon: '🎮',
    color: '#5865F2',
    capabilities: ['post', 'webhook'],
    authType: 'webhook',
    authUrl: '/api/platforms/discord/connect',
    statusUrl: '/api/platforms/discord/status',
    revokeUrl: '/api/platforms/discord/disconnect',
    docUrl: 'https://discord.com/developers/docs/resources/webhook',
    requires: ['DISCORD_WEBHOOK_URL'],
    category: 'social',
  },
  mastodon: {
    id: 'mastodon',
    name: 'Mastodon',
    icon: '🦣',
    color: '#6364FF',
    capabilities: ['post', 'read', 'federated'],
    authType: 'oauth',
    authUrl: '/api/oauth/mastodon/connect',
    statusUrl: '/api/platforms/mastodon/status',
    revokeUrl: '/api/platforms/mastodon/disconnect',
    docUrl: 'https://docs.joinmastodon.org/api/',
    requires: ['MASTODON_CLIENT_ID', 'MASTODON_CLIENT_SECRET', 'MASTODON_INSTANCE'],
    oauthPlatform: 'mastodon',
    category: 'social',
  },
  pinterest: {
    id: 'pinterest',
    name: 'Pinterest',
    icon: '📌',
    color: '#E60023',
    capabilities: ['post', 'pin_creation'],
    authType: 'oauth',
    authUrl: '/api/oauth/pinterest/connect',
    statusUrl: '/api/platforms/pinterest/status',
    revokeUrl: '/api/platforms/pinterest/disconnect',
    docUrl: 'https://developers.pinterest.com/docs/',
    requires: ['PINTEREST_APP_ID', 'PINTEREST_APP_SECRET'],
    oauthPlatform: 'pinterest',
    category: 'social',
  },
});

/** Preferred display order for social tab (Meta/Zalo first, then extended providers). */
export const SOCIAL_PLATFORM_ORDER = Object.freeze([
  'facebook',
  'instagram',
  'zalo',
  'twitter',
  'linkedin',
  'reddit',
  'telegram',
  'discord',
  'mastodon',
  'pinterest',
]);

/** @returns {PlatformDescriptor[]} */
export function listSocialPlatforms() {
  return SOCIAL_PLATFORM_ORDER.map((id) => SOCIAL_PLATFORMS[id]).filter(Boolean);
}

/** @type {Record<string, PlatformDescriptor>} */
export const LLM_PLATFORMS = Object.freeze({
  openai_gpt: {
    id: 'openai_gpt',
    name: 'OpenAI GPT Store',
    icon: '🤖',
    color: '#10A37F',
    capabilities: ['actions_api', 'agent_discovery', 'booking'],
    authType: 'api_key',
    authUrl: '/api/platforms/openai_gpt/connect',
    statusUrl: '/api/platforms/openai_gpt/status',
    revokeUrl: '/api/platforms/openai_gpt/disconnect',
    docUrl: 'https://platform.openai.com/docs',
    requires: ['OPENAI_API_KEY'],
    category: 'llm',
  },
  anthropic_mcp: {
    id: 'anthropic_mcp',
    name: 'Anthropic Claude MCP',
    icon: '🧠',
    color: '#7B61FF',
    capabilities: ['mcp_server', 'resource_read', 'tool_execution'],
    authType: 'api_key',
    authUrl: '/api/platforms/anthropic_mcp/connect',
    statusUrl: '/api/platforms/anthropic_mcp/status',
    revokeUrl: '/api/platforms/anthropic_mcp/disconnect',
    docUrl: 'https://docs.anthropic.com/',
    requires: ['ANTHROPIC_API_KEY'],
    category: 'llm',
  },
  google_gemini: {
    id: 'google_gemini',
    name: 'Google Gemini',
    icon: '🔮',
    color: '#4285F4',
    capabilities: ['function_calling', 'search', 'recommendation'],
    authType: 'api_key',
    authUrl: '/api/platforms/google_gemini/connect',
    statusUrl: '/api/platforms/google_gemini/status',
    revokeUrl: '/api/platforms/google_gemini/disconnect',
    docUrl: 'https://ai.google.dev/docs',
    requires: ['GOOGLE_GEMINI_API_KEY'],
    category: 'llm',
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity AI',
    icon: '🔍',
    color: '#FF4500',
    capabilities: ['answer_engine', 'search', 'citation'],
    authType: 'api_key',
    authUrl: '/api/platforms/perplexity/connect',
    statusUrl: '/api/platforms/perplexity/status',
    revokeUrl: '/api/platforms/perplexity/disconnect',
    docUrl: 'https://docs.perplexity.ai/',
    requires: ['PERPLEXITY_API_KEY'],
    category: 'llm',
  },
});

/** @returns {Record<string, PlatformDescriptor>} */
export function getAllPlatforms() {
  return { ...SOCIAL_PLATFORMS, ...LLM_PLATFORMS };
}

/**
 * @param {string} platformId
 * @returns {PlatformDescriptor | null}
 */
export function getPlatformById(platformId) {
  const id = String(platformId ?? '').trim();
  if (!id) return null;
  return getAllPlatforms()[id] ?? null;
}

/**
 * @param {PlatformDescriptor} platform
 */
export function isPlatformEnvConfigured(platform) {
  if (!platform) return false;

  if (platform.id === 'facebook' || platform.id === 'instagram') {
    const appId = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID;
    const secret = process.env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET;
    const redirect = process.env.FACEBOOK_REDIRECT_URI;
    return Boolean(String(appId ?? '').trim() && String(secret ?? '').trim() && String(redirect ?? '').trim());
  }

  if (platform.id === 'zalo') {
    return Boolean(
      String(process.env.ZALO_APP_ID ?? '').trim() &&
        String(process.env.ZALO_APP_SECRET ?? '').trim() &&
        String(process.env.ZALO_REDIRECT_URI ?? '').trim(),
    );
  }

  const requires = Array.isArray(platform.requires) ? platform.requires : [];
  if (requires.length === 0) return true;
  return requires.every((key) => Boolean(String(process.env[key] ?? '').trim()));
}
