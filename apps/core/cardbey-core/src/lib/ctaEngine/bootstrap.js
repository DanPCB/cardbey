/**
 * Seed default Platform + Store capabilities and CTA variants.
 * Idempotent — safe to call multiple times.
 */

import { registerCapability, getCapability } from './capabilityRegistry/index.js';
import { registerCtaVariant, getCtaVariant } from './ctaRegistry/index.js';
import { registerProvider, getProvider } from './providers/providerRegistry.js';
import { listCapabilities } from './capabilityRegistry/index.js';
import { listVariantsForCapability } from './ctaRegistry/index.js';

let seeded = false;

const PLATFORM_CAPS = [
  {
    id: 'create_store',
    title: 'Create Store',
    description: 'Start a Cardbey storefront for your business',
    category: 'onboarding',
    provider: 'platform',
    deepLink: '/app?intent=create_store',
    priority: 90,
    analyticsId: 'cta.platform.create_store',
    proposedAction: 'create_store',
    completionKey: 'create_store',
  },
  {
    id: 'create_profile',
    title: 'Create Profile',
    category: 'onboarding',
    provider: 'platform',
    deepLink: '/app?intent=create_profile',
    priority: 70,
    analyticsId: 'cta.platform.create_profile',
  },
  {
    id: 'import_menu',
    title: 'Import Menu',
    category: 'catalog',
    provider: 'platform',
    deepLink: '/app?intent=import_menu',
    priority: 75,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.import_menu',
  },
  {
    id: 'import_products',
    title: 'Import Products',
    category: 'catalog',
    provider: 'platform',
    deepLink: '/app?intent=import_products',
    priority: 74,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.import_products',
  },
  {
    id: 'launch_loyalty',
    title: 'Launch Loyalty',
    category: 'retention',
    provider: 'platform',
    deepLink: '/app?intent=setup_loyalty_program',
    priority: 80,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.launch_loyalty',
    proposedAction: 'create_loyalty_program',
    completionKey: 'launch_loyalty',
  },
  {
    id: 'launch_membership',
    title: 'Launch Membership',
    category: 'retention',
    provider: 'platform',
    priority: 72,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.launch_membership',
  },
  {
    id: 'create_promotion',
    title: 'Create Promotion',
    category: 'marketing',
    provider: 'platform',
    priority: 68,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.create_promotion',
  },
  {
    id: 'create_campaign',
    title: 'Create Campaign',
    category: 'marketing',
    provider: 'platform',
    priority: 70,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.create_campaign',
    proposedAction: 'launch_campaign',
  },
  {
    id: 'generate_marketing',
    title: 'Generate Marketing',
    category: 'marketing',
    provider: 'platform',
    priority: 65,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.generate_marketing',
  },
  {
    id: 'import_website',
    title: 'Import Website',
    category: 'onboarding',
    provider: 'platform',
    deepLink: '/app?intent=import_website',
    priority: 78,
    analyticsId: 'cta.platform.import_website',
  },
  {
    id: 'upload_business_card',
    title: 'Upload Business Card',
    category: 'onboarding',
    provider: 'platform',
    deepLink: '/app',
    priority: 76,
    analyticsId: 'cta.platform.upload_business_card',
  },
  {
    id: 'create_booking',
    title: 'Create Booking',
    category: 'commerce',
    provider: 'platform',
    priority: 66,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.create_booking',
  },
  {
    id: 'create_qr_ordering',
    title: 'Create QR Ordering',
    category: 'commerce',
    provider: 'platform',
    priority: 64,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.create_qr_ordering',
  },
  {
    id: 'create_display_screen',
    title: 'Create Display Screen',
    category: 'devices',
    provider: 'platform',
    priority: 60,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.create_display_screen',
  },
  {
    id: 'create_gift_cards',
    title: 'Create Gift Cards',
    category: 'commerce',
    provider: 'platform',
    priority: 55,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.create_gift_cards',
  },
  {
    id: 'invite_staff',
    title: 'Invite Staff',
    category: 'ops',
    provider: 'platform',
    priority: 50,
    dependencies: ['create_store'],
    requiresAuth: true,
    analyticsId: 'cta.platform.invite_staff',
  },
  {
    id: 'invite_customers',
    title: 'Invite Customers',
    category: 'growth',
    provider: 'platform',
    priority: 52,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.invite_customers',
  },
  {
    id: 'create_event',
    title: 'Create Event',
    category: 'marketing',
    provider: 'platform',
    priority: 54,
    dependencies: ['create_store'],
    analyticsId: 'cta.platform.create_event',
  },
  {
    id: 'connect_stripe',
    title: 'Connect Stripe',
    category: 'payments',
    provider: 'platform',
    priority: 62,
    dependencies: ['create_store'],
    requiresAuth: true,
    analyticsId: 'cta.platform.connect_stripe',
  },
  {
    id: 'ai_business_assistant',
    title: 'AI Business Assistant',
    category: 'ai',
    provider: 'platform',
    deepLink: '/app',
    priority: 58,
    analyticsId: 'cta.platform.ai_assistant',
  },
  {
    id: 'view_demo',
    title: 'View Demo',
    category: 'education',
    provider: 'platform',
    priority: 40,
    analyticsId: 'cta.platform.view_demo',
  },
  {
    id: 'learn_more',
    title: 'Learn More',
    category: 'education',
    provider: 'platform',
    priority: 30,
    analyticsId: 'cta.platform.learn_more',
  },
  {
    id: 'become_partner',
    title: 'Become Partner',
    category: 'growth',
    provider: 'platform',
    deepLink: '/partner',
    priority: 48,
    analyticsId: 'cta.platform.become_partner',
  },
  {
    id: 'become_creator',
    title: 'Become Creator',
    category: 'creator',
    provider: 'platform',
    priority: 46,
    analyticsId: 'cta.platform.become_creator',
  },
];

const STORE_CAPS = [
  {
    id: 'store.book',
    title: 'Book',
    category: 'commerce',
    provider: 'store',
    priority: 95,
    analyticsId: 'cta.store.book',
    meta: { defaultAction: 'booking' },
  },
  {
    id: 'store.order',
    title: 'Order',
    category: 'commerce',
    provider: 'store',
    priority: 95,
    analyticsId: 'cta.store.order',
    meta: { defaultAction: 'order' },
  },
  {
    id: 'store.call',
    title: 'Call',
    category: 'contact',
    provider: 'store',
    priority: 60,
    analyticsId: 'cta.store.call',
  },
  {
    id: 'store.message',
    title: 'Message',
    category: 'contact',
    provider: 'store',
    priority: 55,
    analyticsId: 'cta.store.message',
  },
  {
    id: 'store.join_loyalty',
    title: 'Join Loyalty',
    category: 'retention',
    provider: 'store',
    priority: 70,
    analyticsId: 'cta.store.join_loyalty',
    proposedAction: 'join_loyalty',
  },
  {
    id: 'store.request_quote',
    title: 'Request Quote',
    category: 'commerce',
    provider: 'store',
    priority: 80,
    analyticsId: 'cta.store.request_quote',
    meta: { defaultAction: 'inquiry' },
  },
  {
    id: 'store.enquire',
    title: 'Enquire',
    category: 'commerce',
    provider: 'store',
    priority: 85,
    analyticsId: 'cta.store.enquire',
    meta: { defaultAction: 'inquiry' },
  },
  {
    id: 'store.visit',
    title: 'Visit',
    category: 'commerce',
    provider: 'store',
    priority: 40,
    analyticsId: 'cta.store.visit',
  },
];

const VARIANT_SEEDS = [
  { id: 'create_store.primary', capabilityId: 'create_store', label: 'Create your store', contexts: ['store_creation', '*'], weight: 3 },
  { id: 'launch_loyalty.primary', capabilityId: 'launch_loyalty', label: 'Launch loyalty program', contexts: ['loyalty', '*'], weight: 3 },
  { id: 'launch_loyalty.alt1', capabilityId: 'launch_loyalty', label: 'Reward your customers', contexts: ['loyalty'], weight: 2 },
  { id: 'launch_loyalty.alt2', capabilityId: 'launch_loyalty', label: 'Create digital loyalty', contexts: ['loyalty'], weight: 2 },
  { id: 'launch_loyalty.alt3', capabilityId: 'launch_loyalty', label: 'Start customer rewards', contexts: ['loyalty'], weight: 2 },
  { id: 'import_menu.primary', capabilityId: 'import_menu', label: 'Import menu', contexts: ['catalog', '*'], weight: 2 },
  { id: 'ai_business_assistant.primary', capabilityId: 'ai_business_assistant', label: 'AI Business Assistant', contexts: ['ai', '*'], weight: 2 },
  { id: 'create_display_screen.primary', capabilityId: 'create_display_screen', label: 'Create digital display', contexts: ['display', '*'], weight: 2 },
  { id: 'become_creator.primary', capabilityId: 'become_creator', label: 'Become a creator', contexts: ['creator', '*'], weight: 2 },
  { id: 'store.book.primary', capabilityId: 'store.book', label: 'Book now', action: 'booking', placements: ['sticky', 'floating', 'hero'], weight: 5 },
  { id: 'store.order.primary', capabilityId: 'store.order', label: 'Order now', action: 'order', placements: ['sticky', 'floating', 'hero'], weight: 5 },
  { id: 'store.join_loyalty.primary', capabilityId: 'store.join_loyalty', label: 'Join loyalty', action: 'join_loyalty', weight: 2 },
];

function ensureCapability(def) {
  if (!getCapability(def.id)) registerCapability(def);
}

function ensureVariant(def) {
  if (!getCtaVariant(def.id)) registerCtaVariant(def);
}

function ensureRegistryProvider(id) {
  if (getProvider(id)) return;
  registerProvider({
    id,
    label: id,
    listCapabilities(ctx) {
      return listCapabilities({ provider: id }).filter((c) => {
        // Store provider on non-storefront pages contributes nothing by default
        if (id === 'store' && ctx.pageKind && ctx.pageKind !== 'storefront') return false;
        if (id === 'platform' && ctx.pageKind === 'storefront') return false;
        return true;
      });
    },
    listVariants(_ctx, capability) {
      return listVariantsForCapability(capability.id);
    },
  });
}

export function bootstrapCtaEngine() {
  if (seeded) return { already: true };
  for (const cap of PLATFORM_CAPS) ensureCapability(cap);
  for (const cap of STORE_CAPS) ensureCapability(cap);
  for (const v of VARIANT_SEEDS) ensureVariant(v);
  ensureRegistryProvider('platform');
  ensureRegistryProvider('store');
  // Stub providers for future registration without empty-map errors
  for (const id of ['performer', 'discovery', 'campaign']) {
    if (!getProvider(id)) {
      registerProvider({
        id,
        label: id,
        listCapabilities: () => [],
        listVariants: () => [],
      });
    }
  }
  seeded = true;
  return { already: false, capabilities: PLATFORM_CAPS.length + STORE_CAPS.length };
}

/** @internal */
export function _resetBootstrapForTests() {
  seeded = false;
}
