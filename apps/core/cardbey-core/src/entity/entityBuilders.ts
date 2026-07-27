/**
 * Cardbey Entity Framework — Phase 1 builders.
 * Derive CardbeyEntity from existing Business, Product, StorePromo.
 * Read-only; no DB writes. Safe defaults only.
 */

import type { CardbeyEntity } from './cardbeyEntity.js';

/** Raw store record (Business) */
export interface StoreRecord {
  id: string;
  name?: string | null;
  type?: string | null;
  slug?: string | null;
  description?: string | null;
  [key: string]: unknown;
}

/** Raw product record */
export interface ProductRecord {
  id: string;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  businessId?: string | null;
  [key: string]: unknown;
}

/** Raw promotion record (StorePromo) */
export interface PromotionRecord {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  storeId?: string | null;
  productId?: string | null;
  slug?: string | null;
  [key: string]: unknown;
}

const STORE_DEFAULTS = {
  bodyConfig: {
    mode: 'guide' as const,
    assistantEnabled: true,
    chatEnabled: true,
    quickActions: ['Browse catalog', 'Best sellers', "Today's promotion", 'Ask a question'],
  },
  signalConfig: {
    trackViews: true,
    trackClicks: true,
    trackChats: true,
    trackConversion: false,
    trackScans: false,
  },
  missionHooks: {
    availableGoals: ['improve_store_experience', 'create_promotion'],
  },
};

const PRODUCT_DEFAULTS = {
  bodyConfig: {
    mode: 'task' as const,
    assistantEnabled: true,
    chatEnabled: true,
    quickActions: ['Recommend similar', 'Customize', 'Buy now'],
  },
  signalConfig: {
    trackViews: true,
    trackClicks: true,
    trackChats: true,
    trackConversion: true,
    trackScans: false,
  },
  missionHooks: {
    availableGoals: ['recommend_products', 'improve_product_copy'],
  },
};

const PROMOTION_DEFAULTS = {
  bodyConfig: {
    mode: 'performer' as const,
    assistantEnabled: true,
    chatEnabled: true,
    quickActions: ['Claim offer', 'View products', 'Chat now'],
  },
  signalConfig: {
    trackViews: true,
    trackClicks: true,
    trackChats: true,
    trackConversion: true,
    trackScans: true,
  },
  missionHooks: {
    availableGoals: ['improve_promotion', 'launch_campaign'],
  },
};

export function buildStoreEntity(store: StoreRecord): CardbeyEntity {
  const objectId = store.id;
  return {
    entityId: `store:${objectId}`,
    entityType: 'store',
    objectId,
    brainContext: {
      storeId: store.id,
      storeName: store.name ?? undefined,
      storeType: store.type ?? undefined,
      slug: store.slug ?? undefined,
    },
    bodyConfig: {
      ...STORE_DEFAULTS.bodyConfig,
      identity: {
        name: (store.name as string) ?? undefined,
        role: 'store',
      },
    },
    surfaceConfig: { surfaceType: 'store_page', placement: 'bottom_right' },
    signalConfig: STORE_DEFAULTS.signalConfig,
    missionHooks: STORE_DEFAULTS.missionHooks,
  };
}

export function buildProductEntity(product: ProductRecord, storeId?: string | null): CardbeyEntity {
  const objectId = product.id;
  return {
    entityId: `product:${objectId}`,
    entityType: 'product',
    objectId,
    brainContext: {
      productId: product.id,
      productName: product.name ?? undefined,
      category: product.category ?? undefined,
      storeId: storeId ?? undefined,
    },
    bodyConfig: {
      ...PRODUCT_DEFAULTS.bodyConfig,
      identity: {
        name: (product.name as string) ?? undefined,
        role: 'product',
      },
    },
    surfaceConfig: { surfaceType: 'product_page', placement: 'bottom_right' },
    signalConfig: PRODUCT_DEFAULTS.signalConfig,
    missionHooks: PRODUCT_DEFAULTS.missionHooks,
  };
}

export function buildPromotionEntity(promo: PromotionRecord): CardbeyEntity {
  const objectId = promo.id;
  return {
    entityId: `promotion:${objectId}`,
    entityType: 'promotion',
    objectId,
    brainContext: {
      promotionId: promo.id,
      storeId: promo.storeId ?? undefined,
      productId: promo.productId ?? undefined,
      title: promo.title ?? undefined,
      slug: promo.slug ?? undefined,
    },
    bodyConfig: {
      ...PROMOTION_DEFAULTS.bodyConfig,
      identity: {
        name: (promo.title as string) ?? undefined,
        role: 'promotion',
      },
    },
    surfaceConfig: { surfaceType: 'promotion_landing', placement: 'bottom_right' },
    signalConfig: PROMOTION_DEFAULTS.signalConfig,
    missionHooks: PROMOTION_DEFAULTS.missionHooks,
  };
}
