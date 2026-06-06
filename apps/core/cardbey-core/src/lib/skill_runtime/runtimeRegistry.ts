// DANH: skill-runtime-phase2
// DANH: skill-runtime-phase5
// DANH: skill-runtime-phase6
/**
 * Process-wide skill runtime registry (singleton).
 *
 * Registers every intent pattern together with a skill factory. As of Phase 5
 * the operational skills (booking, catalog, menu, store health, promotion) build
 * their steps from real tool executors via `executorFactories`. The underlying
 * executors are read-only/best-effort by design (they import their own Prisma
 * client and degrade gracefully), so dispatch remains safe under the Safe
 * Execution / PIL governance rules — the cooperative gate in the route still
 * gives the legacy router first refusal.
 *
 * `setup_loyalty_program` retains a side-effect-free planning step: there is no
 * dedicated loyalty executor (loyalty/campaign execution lives in the legacy
 * CampaignSkill, same territory as create_promotion's stub).
 *
 * Each runtime is created with `id === intent` so `getCheckpoint().skillId`
 * equals the resolved intent (what callers key on).
 */

import { SkillRegistry } from './registry.js';
import { SkillRuntime } from './skill.js';
import type { SkillContext, Step } from './types.js';
import {
  bookingManagementSteps,
  catalogManagementSteps,
  menuSyncSteps,
  storeHealthSteps,
  analyticsReportSteps,
  createPromotionSteps,
} from './executorFactories.js';
import {
  setupLoyaltyProgramPattern,
  createPromotionPattern,
  catalogManagementPattern,
  menuSyncPattern,
  bookingManagementPattern,
  storeHealthPattern,
  analyticsReportPattern,
  LOYALTY_INTENT,
  PROMOTION_INTENT,
  CATALOG_MANAGEMENT_INTENT,
  MENU_SYNC_INTENT,
  BOOKING_MANAGEMENT_INTENT,
  STORE_HEALTH_INTENT,
  ANALYTICS_REPORT_INTENT,
} from './patterns.js';

/** A single, side-effect-free planning step (governance-safe default). */
function planningStep(intent: string): Step {
  return {
    id: `plan:${intent}`,
    name: `Plan ${intent}`,
    execute: async (context: SkillContext) => ({
      planned: true,
      intent,
      query: context.query,
    }),
  };
}

export const runtimeRegistry = new SkillRegistry();

// TODO(loyalty-executor): wire LoyaltyCampaignSkill steps when LoyaltyCampaignSkill is built in Round 4
runtimeRegistry.register({
  intent: LOYALTY_INTENT,
  patterns: [setupLoyaltyProgramPattern],
  factory: (context) =>
    new SkillRuntime(LOYALTY_INTENT, LOYALTY_INTENT, [planningStep(LOYALTY_INTENT)], context),
});

runtimeRegistry.register({
  intent: PROMOTION_INTENT,
  patterns: [createPromotionPattern],
  factory: (context) =>
    new SkillRuntime(PROMOTION_INTENT, PROMOTION_INTENT, createPromotionSteps(), context),
});

runtimeRegistry.register({
  intent: CATALOG_MANAGEMENT_INTENT,
  patterns: [catalogManagementPattern],
  factory: (context) =>
    new SkillRuntime(
      CATALOG_MANAGEMENT_INTENT,
      CATALOG_MANAGEMENT_INTENT,
      catalogManagementSteps(),
      context
    ),
});

runtimeRegistry.register({
  intent: MENU_SYNC_INTENT,
  patterns: [menuSyncPattern],
  factory: (context) =>
    new SkillRuntime(MENU_SYNC_INTENT, MENU_SYNC_INTENT, menuSyncSteps(), context),
});

runtimeRegistry.register({
  intent: BOOKING_MANAGEMENT_INTENT,
  patterns: [bookingManagementPattern],
  factory: (context) =>
    new SkillRuntime(
      BOOKING_MANAGEMENT_INTENT,
      BOOKING_MANAGEMENT_INTENT,
      bookingManagementSteps(),
      context
    ),
});

runtimeRegistry.register({
  intent: STORE_HEALTH_INTENT,
  patterns: [storeHealthPattern],
  factory: (context) =>
    new SkillRuntime(STORE_HEALTH_INTENT, STORE_HEALTH_INTENT, storeHealthSteps(), context),
});

runtimeRegistry.register({
  intent: ANALYTICS_REPORT_INTENT,
  patterns: [analyticsReportPattern],
  factory: (context) =>
    new SkillRuntime(
      ANALYTICS_REPORT_INTENT,
      ANALYTICS_REPORT_INTENT,
      analyticsReportSteps(),
      context
    ),
});
