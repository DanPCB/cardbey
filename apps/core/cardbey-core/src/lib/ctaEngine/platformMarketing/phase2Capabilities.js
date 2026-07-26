/**
 * Phase 2 platform marketing capability seed + action descriptors (serialisable).
 * IDs are stable; labels are not identifiers.
 */

/** @typedef {'CREATE_STORE'|'CREATE_PROFILE'|'LIST_CATALOG'|'IMPORT_MENU'|'LAUNCH_LOYALTY'|'LEARN_MORE'} Phase2CapabilityId */

/** @type {Record<string, string>} semantic section → preferred capability id */
export const MARKETING_SECTION_CAPABILITY = Object.freeze({
  STORE_CREATION: 'create_store',
  PROFILE_IDENTITY: 'create_profile',
  PRODUCTS_SERVICES: 'list_catalog',
  MENU_IMPORT: 'import_menu',
  LOYALTY: 'launch_loyalty',
  PLATFORM_OVERVIEW: 'learn_more',
});

/**
 * @typedef {object} PlatformActionDescriptor
 * @property {string} kind  performer_launch | navigate | scroll_section
 * @property {string} [path]
 * @property {string} [missionPrompt]
 * @property {string} [sectionId]
 * @property {boolean} [requiresAuth]
 * @property {string} [resumeKey]
 */

/** @type {Array<{
 *   id: string,
 *   title: string,
 *   description: string,
 *   category: string,
 *   provider: 'platform',
 *   priority: number,
 *   requiresAuth: boolean,
 *   completionKey: string,
 *   analyticsId: string,
 *   deepLink: string,
 *   proposedAction?: string,
 *   action: PlatformActionDescriptor,
 *   variantLabel: string,
 *   contexts: string[],
 * }>} */
export const PHASE2_PLATFORM_CAPABILITIES = [
  {
    id: 'create_store',
    title: 'Create Store',
    description: 'Start a Cardbey storefront for your business',
    category: 'onboarding',
    provider: 'platform',
    priority: 90,
    requiresAuth: false,
    completionKey: 'create_store',
    analyticsId: 'cta.platform.create_store',
    deepLink: '/for-business',
    proposedAction: 'create_store',
    variantLabel: 'Create your store',
    contexts: ['STORE_CREATION', 'PLATFORM_OVERVIEW', '*'],
    action: {
      kind: 'performer_launch',
      missionPrompt: 'Create a complete online store with catalog and checkout',
      requiresAuth: false,
      resumeKey: 'cta.create_store',
    },
  },
  {
    id: 'create_profile',
    title: 'Create Profile',
    description: 'Set up your Cardbey identity profile',
    category: 'onboarding',
    provider: 'platform',
    priority: 72,
    requiresAuth: true,
    completionKey: 'create_profile',
    analyticsId: 'cta.platform.create_profile',
    deepLink: '/app?entry=performer&intent=create_profile',
    variantLabel: 'Create your profile',
    contexts: ['PROFILE_IDENTITY', '*'],
    action: {
      kind: 'navigate',
      path: '/app?entry=performer&intent=create_profile',
      requiresAuth: true,
      resumeKey: 'cta.create_profile',
    },
  },
  {
    id: 'list_catalog',
    title: 'List Catalog',
    description: 'List products or services on your storefront',
    category: 'catalog',
    provider: 'platform',
    priority: 76,
    requiresAuth: false,
    completionKey: 'list_catalog',
    analyticsId: 'cta.platform.list_catalog',
    deepLink: '/for-business',
    /** Soft deps — marketing discovery does not hard-gate on create_store completion */
    featureDependencies: ['create_store'],
    variantLabel: 'List products or services',
    contexts: ['PRODUCTS_SERVICES', '*'],
    action: {
      kind: 'performer_launch',
      missionPrompt: 'List products or services for my business catalog',
      requiresAuth: false,
      resumeKey: 'cta.list_catalog',
    },
  },
  {
    id: 'import_menu',
    title: 'Import Menu',
    description: 'Import a menu or catalog into Cardbey',
    category: 'catalog',
    provider: 'platform',
    priority: 78,
    requiresAuth: false,
    completionKey: 'import_menu',
    analyticsId: 'cta.platform.import_menu',
    deepLink: '/for-business',
    featureDependencies: ['create_store'],
    variantLabel: 'Import your menu',
    contexts: ['MENU_IMPORT', '*'],
    action: {
      kind: 'performer_launch',
      missionPrompt: 'Import my menu into a digital catalog with photos and prices',
      requiresAuth: false,
      resumeKey: 'cta.import_menu',
    },
  },
  {
    id: 'launch_loyalty',
    title: 'Launch Loyalty',
    description: 'Start a digital loyalty program for customers',
    category: 'retention',
    provider: 'platform',
    priority: 80,
    requiresAuth: false,
    completionKey: 'launch_loyalty',
    analyticsId: 'cta.platform.launch_loyalty',
    deepLink: '/for-business',
    proposedAction: 'create_loyalty_program',
    featureDependencies: ['create_store'],
    variantLabel: 'Launch a loyalty program',
    contexts: ['LOYALTY', '*'],
    action: {
      kind: 'performer_launch',
      missionPrompt: 'Set up a loyalty program to reward my customers',
      requiresAuth: false,
      resumeKey: 'cta.launch_loyalty',
    },
  },
  {
    id: 'learn_more',
    title: 'Learn More',
    description: 'Learn what Cardbey can do for your business',
    category: 'education',
    provider: 'platform',
    priority: 40,
    requiresAuth: false,
    completionKey: 'learn_more',
    analyticsId: 'cta.platform.learn_more',
    deepLink: '/for-business#cta-section-PLATFORM_OVERVIEW',
    variantLabel: 'Learn more',
    contexts: ['PLATFORM_OVERVIEW', '*'],
    action: {
      kind: 'scroll_section',
      sectionId: 'PLATFORM_OVERVIEW',
      requiresAuth: false,
      resumeKey: 'cta.learn_more',
    },
  },
];

/**
 * Normalise section id from DOM / client.
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function normaliseMarketingSection(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
  if (!s) return null;
  if (MARKETING_SECTION_CAPABILITY[s]) return s;
  return s;
}
