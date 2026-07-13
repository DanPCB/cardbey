/**
 * Intent-driven loyalty recommendations from real store catalog context.
 * Returns structured proposals — never auto-applies.
 */

import { randomUUID } from 'node:crypto';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function pickPrice(product) {
  const n = Number(product?.price ?? product?.unitPrice ?? product?.basePrice);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {Array<{ id?: string; name?: string; category?: string; itemType?: string; price?: number }>} products
 */
function catalogRefsForProducts(products, names = []) {
  const refs = [];
  for (const name of names) {
    const match = products.find((p) => pickString(p?.name).toLowerCase() === name.toLowerCase());
    refs.push(match?.id ? String(match.id) : `catalog:${name}`);
  }
  return refs;
}

/**
 * @typedef {{
 *   id: string;
 *   title: string;
 *   rule: import('./loyaltyTopologyTypes.js').LoyaltyProgramRule;
 *   rationale: string;
 *   estimatedBusinessCost?: string;
 *   customerValue?: string;
 *   confidence: number;
 *   basedOnCatalogRefs: string[];
 *   suggestionOnly?: boolean;
 * }} LoyaltyRecommendation
 */

/**
 * @param {{
 *   storeName?: string;
 *   businessCategory?: string;
 *   products?: Array<Record<string, unknown>>;
 *   customerCount?: number;
 * }} context
 * @returns {LoyaltyRecommendation[]}
 */
export function buildLoyaltyRecommendations(context = {}) {
  const products = Array.isArray(context.products) ? context.products : [];
  const category = pickString(context.businessCategory, 'General').toLowerCase();
  const storeName = pickString(context.storeName, 'your store');
  /** @type {LoyaltyRecommendation[]} */
  const recommendations = [];

  const serviceProducts = products.filter((p) => {
    const type = pickString(p?.itemType, p?.category).toLowerCase();
    const name = pickString(p?.name);
    return name && (type.includes('service') || type.includes('product') || !type);
  });

  const namedServices = serviceProducts
    .map((p) => pickString(p?.name))
    .filter(Boolean)
    .slice(0, 6);

  const isNails = /nail|manicure|pedicure|gel|salon|beauty|spa/.test(
    `${category} ${namedServices.join(' ').toLowerCase()}`,
  );
  const isCoffee = /coffee|cafe|espresso|latte|bakery/.test(
    `${category} ${namedServices.join(' ').toLowerCase()}`,
  );

  if (isNails && namedServices.length > 0) {
    const gelService =
      namedServices.find((n) => /gel|manicure|nail/i.test(n)) ?? namedServices[0];
    const refs = catalogRefsForProducts(products, [gelService]);
    recommendations.push({
      id: `rec_${randomUUID().slice(0, 8)}`,
      title: `6× ${gelService} → next one free`,
      rule: {
        programType: 'STAMP_CARD',
        purchaseItem: gelService,
        purchasesRequired: 6,
        rewardQuantity: 1,
        rewardItem: `Free ${gelService}`,
        repeatMode: 'INDEFINITE',
      },
      rationale: `Rewards repeat bookings for ${gelService}, a core service at ${storeName}.`,
      estimatedBusinessCost: 'Cost of one service after six paid visits',
      customerValue: 'A free treatment after loyalty',
      confidence: namedServices.includes(gelService) ? 0.86 : 0.72,
      basedOnCatalogRefs: refs,
    });

    if (namedServices.length >= 2) {
      const bundle = namedServices.slice(0, 2).join(' or ');
      recommendations.push({
        id: `rec_${randomUUID().slice(0, 8)}`,
        title: '5 eligible services → $20 off',
        rule: {
          programType: 'STAMP_CARD',
          purchaseItem: 'eligible service',
          purchasesRequired: 5,
          rewardQuantity: 1,
          rewardItem: '$20 off next appointment',
          repeatMode: 'INDEFINITE',
        },
        rationale: `Flexible stamp card across ${bundle} without locking to one SKU.`,
        estimatedBusinessCost: '$20 discount after five visits',
        customerValue: 'Meaningful dollar reward',
        confidence: 0.8,
        basedOnCatalogRefs: catalogRefsForProducts(products, namedServices.slice(0, 2)),
      });
    }

    const priced = serviceProducts.find((p) => pickPrice(p) != null);
    if (priced) {
      const spendTarget = Math.max(200, Math.round((pickPrice(priced) ?? 50) * 6));
      recommendations.push({
        id: `rec_${randomUUID().slice(0, 8)}`,
        title: `Spend $${spendTarget} → nail-art upgrade`,
        rule: {
          programType: 'STAMP_CARD',
          purchaseItem: 'eligible spend',
          purchasesRequired: Math.max(4, Math.round(spendTarget / (pickPrice(priced) ?? 50))),
          rewardQuantity: 1,
          rewardItem: 'Complimentary nail-art upgrade',
          repeatMode: 'INDEFINITE',
        },
        rationale: 'Spend-based reward for higher-value clients.',
        estimatedBusinessCost: 'Upgrade material + time',
        customerValue: 'Premium add-on reward',
        confidence: 0.74,
        basedOnCatalogRefs: priced?.id ? [String(priced.id)] : [],
        suggestionOnly: true,
      });
    }
  } else if (isCoffee && namedServices.length > 0) {
    const coffeeItem = namedServices.find((n) => /coffee|latte|drink/i.test(n)) ?? namedServices[0];
    recommendations.push({
      id: `rec_${randomUUID().slice(0, 8)}`,
      title: `Buy 9 ${coffeeItem} → 1 free`,
      rule: {
        programType: 'STAMP_CARD',
        purchaseItem: coffeeItem,
        purchasesRequired: 9,
        rewardQuantity: 1,
        rewardItem: `Free ${coffeeItem}`,
        repeatMode: 'INDEFINITE',
      },
      rationale: `Classic stamp card aligned with ${coffeeItem} on your menu.`,
      confidence: 0.84,
      basedOnCatalogRefs: catalogRefsForProducts(products, [coffeeItem]),
    });
  } else if (namedServices.length > 0) {
    const top = namedServices[0];
    recommendations.push({
      id: `rec_${randomUUID().slice(0, 8)}`,
      title: `Buy 9 ${top} → 1 free`,
      rule: {
        programType: 'STAMP_CARD',
        purchaseItem: top,
        purchasesRequired: 9,
        rewardQuantity: 1,
        rewardItem: `Free ${top}`,
        repeatMode: 'INDEFINITE',
      },
      rationale: `Uses ${top} from your catalog as the qualifying purchase.`,
      confidence: 0.78,
      basedOnCatalogRefs: catalogRefsForProducts(products, [top]),
    });
    if (namedServices.length > 1) {
      const second = namedServices[1];
      recommendations.push({
        id: `rec_${randomUUID().slice(0, 8)}`,
        title: `6× ${second} → reward perk`,
        rule: {
          programType: 'STAMP_CARD',
          purchaseItem: second,
          purchasesRequired: 6,
          rewardQuantity: 1,
          rewardItem: `Free ${second}`,
          repeatMode: 'INDEFINITE',
        },
        rationale: `Alternative focused on ${second}.`,
        confidence: 0.72,
        basedOnCatalogRefs: catalogRefsForProducts(products, [second]),
      });
    }
  } else {
    recommendations.push({
      id: `rec_${randomUUID().slice(0, 8)}`,
      title: 'Visit-based rewards',
      rule: {
        programType: 'STAMP_CARD',
        purchaseItem: 'visit',
        purchasesRequired: 8,
        rewardQuantity: 1,
        rewardItem: 'Reward perk',
        repeatMode: 'INDEFINITE',
      },
      rationale: `General visit stamp card for ${storeName} — add catalog items to sharpen rewards.`,
      confidence: 0.55,
      basedOnCatalogRefs: [],
      suggestionOnly: true,
    });
  }

  return recommendations.slice(0, 4);
}

export default { buildLoyaltyRecommendations };
