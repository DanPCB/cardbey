/**
 * Cardbey intent patterns.
 *
 * These encode the disambiguation rules that fix the original bug: the word
 * "campaign" alone must not route a loyalty request into the promotion
 * pipeline. Loyalty signals demote generic "campaign", and loyalty/promotion
 * actively demote each other so mixed phrasing resolves to the dominant intent.
 *
 * Weights are calibrated against the Phase 1 success criteria:
 *   - "Setup a loyalty campaign"  → setup_loyalty_program (not promotion)
 *   - "Create a 20% discount"     → create_promotion       (not loyalty)
 * Note: the primary keyword weight (0.7) intentionally keeps an explicit
 * loyalty request above threshold even after the generic-"campaign" demotion,
 * unlike a naive 0.6/-0.3 split which would sink it below 0.7.
 */

import type { IntentPattern, SkillContext } from './types.js';

export const LOYALTY_INTENT = 'setup_loyalty_program';
export const PROMOTION_INTENT = 'create_promotion';

export const setupLoyaltyProgramPattern: IntentPattern = {
  intent: LOYALTY_INTENT,
  priority: 8,
  requiredConfidence: 0.7,
  matches: async (context: SkillContext): Promise<number> => {
    let score = 0;
    const q = context.query.toLowerCase();
    if (/loyalty|tier|points|rewards|member/.test(q)) score += 0.7; // strong primary signal
    if (context.userHasProducts) score += 0.2;
    if (context.existingSegments?.length) score += 0.1;
    if (/campaign/.test(q)) score -= 0.2; // demote generic "campaign", don't veto loyalty
    return Math.min(score, 1.0);
  },
};

export const createPromotionPattern: IntentPattern = {
  intent: PROMOTION_INTENT,
  priority: 7,
  requiredConfidence: 0.6,
  matches: async (context: SkillContext): Promise<number> => {
    let score = 0;
    const q = context.query.toLowerCase();
    // DANH: skill-runtime-phase2 (weight bumped 0.55 → 0.65 in phase3 so bare
    // "discount" clears the 0.6 threshold without a product bonus)
    if (/promotion|discount|offer|sale/.test(q)) score += 0.65;
    if (context.userHasProducts) score += 0.3;
    if (/loyalty/.test(q)) score -= 0.4; // demote loyalty
    return Math.min(score, 1.0);
  },
};

// DANH: skill-runtime-phase2
// ─────────────────────────── Phase 2 collision patterns ────────────────────
// These cover intents that previously collided under keyword matching. Each
// has priority 2 (loyalty/promotion outrank them on confidence ties) and a
// 0.65 threshold.
//
// Calibration note: the spec wrote separators as a literal `.` (e.g.
// `add.product`). A single-char wildcard cannot match the natural-language
// test phrases ("Add a product" has three chars between "add" and "product"),
// so the separators are generalized to `.*`. The keyword set and demotions are
// otherwise exactly as specified.

export const CATALOG_MANAGEMENT_INTENT = 'catalog_management';
export const MENU_SYNC_INTENT = 'menu_sync';
export const BOOKING_MANAGEMENT_INTENT = 'booking_management';
export const STORE_HEALTH_INTENT = 'store_health';
// DANH: skill-runtime-phase6
export const ANALYTICS_REPORT_INTENT = 'analytics_report';

export const catalogManagementPattern: IntentPattern = {
  intent: CATALOG_MANAGEMENT_INTENT,
  priority: 2,
  requiredConfidence: 0.65,
  matches: async (context: SkillContext): Promise<number> => {
    const q = context.query.toLowerCase();
    let score = 0;
    if (/(add|update|remove).*product|my.*products?|product.*(list|catalog|price|category)/.test(q)) {
      score += 0.8;
    }
    if (/menu|sync/.test(q)) score -= 0.3; // menu-sync phrasing belongs to menu_sync
    return Math.min(score, 1.0);
  },
};

export const menuSyncPattern: IntentPattern = {
  intent: MENU_SYNC_INTENT,
  priority: 2,
  requiredConfidence: 0.65,
  matches: async (context: SkillContext): Promise<number> => {
    const q = context.query.toLowerCase();
    let score = 0;
    if (/(sync|import|update|refresh).*menu|menu.*sync|restaurant.*menu|my.*menu/.test(q)) {
      score += 0.8;
    }
    if (/product|catalog/.test(q)) score -= 0.2; // product phrasing belongs to catalog
    return Math.min(score, 1.0);
  },
};

export const bookingManagementPattern: IntentPattern = {
  intent: BOOKING_MANAGEMENT_INTENT,
  priority: 2,
  requiredConfidence: 0.65,
  matches: async (context: SkillContext): Promise<number> => {
    const q = context.query.toLowerCase();
    let score = 0;
    if (
      /(book|take|confirm|cancel|create|new).*(booking|appointment)|check.*availability|my.*bookings|booking.*list|schedule.*customer/.test(
        q
      )
    ) {
      score += 0.8;
    }
    if (/stats|analytics|report|how.*many/.test(q)) score -= 0.4; // reporting belongs to analytics
    return Math.min(score, 1.0);
  },
};

export const storeHealthPattern: IntentPattern = {
  intent: STORE_HEALTH_INTENT,
  priority: 2,
  requiredConfidence: 0.65,
  matches: async (context: SkillContext): Promise<number> => {
    const q = context.query.toLowerCase();
    let score = 0;
    if (
      /audit.*store|store.*health|what.*s.*missing|complete.*my.*profile|store.*score|store.*completeness|improve.*my.*store/.test(
        q
      )
    ) {
      score += 0.8;
    }
    if (/launch|create.*store|setup.*store/.test(q)) score -= 0.3; // store creation belongs elsewhere
    return Math.min(score, 1.0);
  },
};

/** Store performance analytics and reporting (Phase 6). */
export const analyticsReportPattern: IntentPattern = {
  intent: ANALYTICS_REPORT_INTENT,
  priority: 2,
  requiredConfidence: 0.65,
  matches: async (context: SkillContext): Promise<number> => {
    const q = context.query.toLowerCase();
    let score = 0;
    if (
      /analytics|store.*performance|how.*is.*my.*store|store.*stats|insights|sales.*report|view.*report|how.*many.*bookings|traffic|conversion|store.*performing/.test(
        q
      )
    ) {
      score += 0.75;
    }
    if (/audit|health|missing|checklist/.test(q)) score -= 0.3; // completeness audit belongs to store_health
    if (/product|catalog/.test(q)) score -= 0.4; // product analytics belongs to catalog, not store performance
    if (/how.*many.*bookings|my.*bookings/.test(q)) score -= 0.5; // booking counts belong to booking_management / legacy
    return Math.min(score, 1.0);
  },
};

/** All Cardbey patterns, ready to register on a disambiguator. */
export const CARDBEY_INTENT_PATTERNS: IntentPattern[] = [
  setupLoyaltyProgramPattern,
  createPromotionPattern,
  // DANH: skill-runtime-phase2
  catalogManagementPattern,
  menuSyncPattern,
  bookingManagementPattern,
  storeHealthPattern,
  // DANH: skill-runtime-phase6
  analyticsReportPattern,
];
