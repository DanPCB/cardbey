/**
 * OAuth Provider Configuration Validation
 * Checks which OAuth providers are properly configured
 */

/**
 * @typedef {Object} ProviderStatus
 * @property {'facebook'|'tiktok'|'twitter'|'dev'} name - Provider name
 * @property {boolean} ok - Whether provider is fully configured
 * @property {string[]} missing - Names of missing environment variables
 */

/**
 * Required environment variables for each provider
 */
const PROVIDER_CONFIGS = {
  facebook: {
    required: ['FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET', 'FACEBOOK_REDIRECT_URI'],
  },
  tiktok: {
    required: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI'],
  },
  twitter: {
    required: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET', 'TWITTER_REDIRECT_URI'],
  },
};

/**
 * Check if dev fake OAuth is enabled
 * @returns {boolean}
 */
function isDevFakeEnabled() {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.OAUTH_DEV_FAKE === '1'
  );
}

/**
 * Get status for a single provider
 * @param {string} providerName - Provider name (facebook, tiktok, twitter)
 * @returns {ProviderStatus}
 */
function getProviderStatus(providerName) {
  const config = PROVIDER_CONFIGS[providerName.toLowerCase()];
  if (!config) {
    return {
      name: providerName,
      ok: false,
      missing: [],
    };
  }

  // Check which required env vars are missing
  const missing = config.required.filter((key) => {
    const value = process.env[key];
    return !value || value.trim().length === 0;
  });

  return {
    name: providerName,
    ok: missing.length === 0,
    missing,
  };
}

/**
 * Get status for all providers including dev fake if enabled
 * @returns {ProviderStatus[]}
 */
export function getProviderStatuses() {
  const statuses = [];
  
  // Check each configured provider
  for (const providerName of Object.keys(PROVIDER_CONFIGS)) {
    statuses.push(getProviderStatus(providerName));
  }
  
  // Add dev fake provider if enabled
  if (isDevFakeEnabled()) {
    statuses.push({
      name: 'dev',
      ok: true,
      missing: [],
    });
  }
  
  return statuses;
}

/**
 * Check if a provider is configured
 * @param {string} providerName - Provider name (facebook, tiktok, twitter)
 * @returns {boolean}
 */
function isProviderConfigured(providerName) {
  const status = getProviderStatus(providerName);
  return status.ok;
}

/**
 * Get list of configured OAuth providers
 * @returns {string[]} Array of provider names (e.g., ['facebook', 'twitter'])
 */
export function getConfiguredProviders() {
  const statuses = getProviderStatuses();
  return statuses.filter((s) => s.ok).map((s) => s.name);
}

/**
 * Get OAuth health status with detailed information
 * @returns {{ ok: boolean, providers: string[], details: ProviderStatus[] }}
 */
export function getOAuthStatus() {
  const details = getProviderStatuses();
  const providers = details.filter((s) => s.ok).map((s) => s.name);
  
  return {
    ok: providers.length > 0,
    providers,
    details,
  };
}

