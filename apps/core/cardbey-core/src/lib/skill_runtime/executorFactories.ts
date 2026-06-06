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
