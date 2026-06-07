// DANH: skill-runtime-phase5
// DANH: skill-runtime-phase6
/**
 * Executor factories — one factory per runtime skill that produces the ordered
 * `Step[]` for that skill by wrapping existing JS tool executors (Phase 5).
 *
 * Audit notes (vs. the Phase 5 task sketch):
 *  - Tool executors live in sub-directories (`booking/`, `catalog/`, `menu/`),
 *    not the flat `toolExecutors/` paths the sketch assumed. Imports below use
 *    the real paths with `.js` extensions (existing repo convention).
 *  - Every executor is `export default execute` with signature
 *    `execute(input = {}, context = {})` and reads `input.storeId`. So
 *    `wrapExecutor('id', 'desc', (input) => fn(input))` matches as-is.
 *  - Chained pairs (analytics, store health) use `wrapChainedSteps` with
 *    `toAccumulator` extractors so step 2 receives `analytics` / `audit` keys
 *    (executors nest payloads under `output`, not at the top level).
 *  - `get_review_summary.js` exists but no runtime pattern maps to reviews, so it
 *    is intentionally not wired here.
 */

import type { Step } from './types.js';
import { wrapExecutor, wrapChainedSteps } from './stepAdapter.js';

import checkBookingAvailability from '../toolExecutors/booking/check_booking_availability.js';
import createBookingRecord from '../toolExecutors/booking/create_booking_record.js';
import getBookingSummary from '../toolExecutors/booking/get_booking_summary.js';
import manageProductCatalog from '../toolExecutors/catalog/manage_product_catalog.js';
import manageMenuSync from '../toolExecutors/menu/manage_menu_sync.js';
import getStoreAnalytics from '../toolExecutors/get_store_analytics.js';
import generateReportSummary from '../toolExecutors/generate_report_summary.js';
import auditStoreCompleteness from '../toolExecutors/audit_store_completeness.js';
import generateHealthReport from '../toolExecutors/generate_health_report.js';
import segmentLoyalCustomers from '../toolExecutors/loyalty/segment_loyal_customers.js';
import defineLoyaltyTiers from '../toolExecutors/loyalty/define_loyalty_tiers.js';
import createLoyaltyOffer from '../toolExecutors/loyalty/create_loyalty_offer.js';
import scheduleLoyaltyCampaign from '../toolExecutors/loyalty/schedule_loyalty_campaign.js';
import analyzeVideoBrief from '../toolExecutors/video/analyze_video_brief.js';
import generateVideoScript from '../toolExecutors/video/generate_video_script.js';
import queueVideoGeneration from '../toolExecutors/video/queue_video_generation.js';

type Executor = (input: Record<string, unknown>) => Promise<unknown> | unknown;

const asExecutor = (fn: unknown): Executor => fn as Executor;

/** Pull nested analytics object from get_store_analytics executor return. */
function extractAnalyticsForChain(output: unknown): Record<string, unknown> {
  const bag = output as Record<string, unknown> | null;
  const nested = bag?.output as Record<string, unknown> | undefined;
  const analytics = nested?.analytics ?? bag?.analytics;
  return analytics && typeof analytics === 'object' ? { analytics } : {};
}

/** Pull audit fields from audit_store_completeness executor return. */
function extractAuditForChain(output: unknown): Record<string, unknown> {
  const bag = output as Record<string, unknown> | null;
  const nested = bag?.output as Record<string, unknown> | undefined;
  if (!nested || typeof nested.score !== 'number') return {};
  return {
    audit: {
      score: nested.score,
      missing: nested.missing,
      present: nested.present,
      criticalMissing: nested.criticalMissing,
      productCount: nested.productCount,
    },
  };
}

/** booking_management → availability → create → summary. */
export function bookingManagementSteps(): Step[] {
  return [
    wrapExecutor('check_availability', 'Check booking availability', (input) =>
      asExecutor(checkBookingAvailability)(input)
    ),
    wrapExecutor('create_booking', 'Create booking record', (input) =>
      asExecutor(createBookingRecord)(input)
    ),
    wrapExecutor('booking_summary', 'Get booking summary', (input) =>
      asExecutor(getBookingSummary)(input)
    ),
  ];
}

/** catalog_management → manage product catalog. */
export function catalogManagementSteps(): Step[] {
  return [
    wrapExecutor('manage_catalog', 'Manage product catalog', (input) =>
      asExecutor(manageProductCatalog)(input)
    ),
  ];
}

/** menu_sync → sync menu data. */
export function menuSyncSteps(): Step[] {
  return [
    wrapExecutor('sync_menu', 'Sync menu data', (input) =>
      asExecutor(manageMenuSync)(input)
    ),
  ];
}

/** store_health → audit completeness → health report (chained). */
export function storeHealthSteps(): Step[] {
  return wrapChainedSteps([
    {
      id: 'audit_completeness',
      name: 'Audit store completeness',
      fn: (input) => asExecutor(auditStoreCompleteness)(input),
      toAccumulator: extractAuditForChain,
    },
    {
      id: 'health_report',
      name: 'Generate health report',
      fn: (input) => asExecutor(generateHealthReport)(input),
    },
  ]);
}

/** analytics_report → store analytics → report summary (chained). */
export function analyticsReportSteps(): Step[] {
  return wrapChainedSteps([
    {
      id: 'store_analytics',
      name: 'Get store analytics',
      fn: (input) => asExecutor(getStoreAnalytics)(input),
      toAccumulator: extractAnalyticsForChain,
    },
    {
      id: 'report_summary',
      name: 'Generate report summary',
      fn: (input) => asExecutor(generateReportSummary)(input),
    },
  ]);
}

/**
 * create_promotion → structured stub.
 *
 * Real campaign execution lives in the legacy CampaignSkill. The cooperative
 * gate routes create_promotion through legacy when `findByTrigger` matches, so
 * this factory only fires for a novel promotion phrase the legacy router does
 * not recognise. The stub records intent without side effects (governance-safe).
 */
export function createPromotionSteps(): Step[] {
  return [
    wrapExecutor('create_promotion', 'Create store promotion', (input) =>
      Promise.resolve({
        status: 'pending_campaign_executor',
        note: 'CampaignSkill handles this via legacy router',
        input,
      })
    ),
  ];
}

/** Pull segment fields from segment_loyal_customers executor return. */
function extractSegmentForChain(output: unknown): Record<string, unknown> {
  const bag = output as Record<string, unknown> | null;
  const nested = bag?.output as Record<string, unknown> | undefined;
  const out = nested ?? bag;
  return {
    customerCount: typeof out?.customerCount === 'number' ? out.customerCount : 0,
    segmented: out?.segmented ?? false,
  };
}

/** Pull tiers from define_loyalty_tiers executor return. */
function extractTiersForChain(output: unknown): Record<string, unknown> {
  const bag = output as Record<string, unknown> | null;
  const nested = bag?.output as Record<string, unknown> | undefined;
  const out = nested ?? bag;
  return { tiers: Array.isArray(out?.tiers) ? out.tiers : [] };
}

/** Pull offers from create_loyalty_offer executor return. */
function extractOffersForChain(output: unknown): Record<string, unknown> {
  const bag = output as Record<string, unknown> | null;
  const nested = bag?.output as Record<string, unknown> | undefined;
  const out = nested ?? bag;
  return { offers: Array.isArray(out?.offers) ? out.offers : [] };
}

// DANH: skill-round4-loyalty
/** setup_loyalty_program → segment → tiers → offers → schedule (chained). */
export function loyaltyCampaignSteps(): Step[] {
  return wrapChainedSteps([
    {
      id: 'segment_loyal_customers',
      name: 'Segment loyal customers',
      fn: (input) => asExecutor(segmentLoyalCustomers)(input),
      toAccumulator: extractSegmentForChain,
    },
    {
      id: 'define_loyalty_tiers',
      name: 'Define loyalty tiers',
      fn: (input) => asExecutor(defineLoyaltyTiers)(input),
      toAccumulator: extractTiersForChain,
    },
    {
      id: 'create_loyalty_offer',
      name: 'Create loyalty offers',
      fn: (input) => asExecutor(createLoyaltyOffer)(input),
      toAccumulator: extractOffersForChain,
    },
    {
      id: 'schedule_loyalty_campaign',
      name: 'Schedule loyalty campaign',
      fn: (input) => asExecutor(scheduleLoyaltyCampaign)(input),
    },
  ]);
}

/** Pull brief fields from analyze_video_brief executor return. */
function extractBriefForChain(output: unknown): Record<string, unknown> {
  const bag = output as Record<string, unknown> | null;
  const nested = bag?.output as Record<string, unknown> | undefined;
  const out = nested ?? bag ?? {};
  return {
    style: out.style,
    duration: out.duration,
    mood: out.mood,
    storeName: out.storeName,
  };
}

/** Pull script from generate_video_script executor return. */
function extractScriptForChain(output: unknown): Record<string, unknown> {
  const bag = output as Record<string, unknown> | null;
  const nested = bag?.output as Record<string, unknown> | undefined;
  const out = nested ?? bag ?? {};
  return { script: out.script ?? out };
}

// DANH: fix-video-routing
/** video_generation → brief → script → queue (chained). */
export function videoGenerationSteps(): Step[] {
  return wrapChainedSteps([
    {
      id: 'analyze_video_brief',
      name: 'Analyze video brief',
      fn: (input) =>
        asExecutor(analyzeVideoBrief)({
          ...input,
          userMessage: String(input.userMessage ?? input.query ?? ''),
        }),
      toAccumulator: extractBriefForChain,
    },
    {
      id: 'generate_video_script',
      name: 'Generate video script',
      fn: (input) => asExecutor(generateVideoScript)(input),
      toAccumulator: extractScriptForChain,
    },
    {
      id: 'queue_video_generation',
      name: 'Queue video generation',
      fn: (input) =>
        asExecutor(queueVideoGeneration)({
          script: input.script,
          style: input.style,
          storeName: input.storeName,
          duration: typeof input.duration === 'number' ? input.duration : 5,
        }),
    },
  ]);
}
