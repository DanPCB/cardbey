/**
 * Insight Action Builder
 * 
 * Utilities for building orchestrator actions from insights.
 * Maps insights to entry points and builds appropriate payloads.
 */

import { randomUUID } from 'crypto';

/**
 * Typed input validation failure for insight → orchestrator payloads (non-fatal for insight generation).
 */
export class InsightInputError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, entryPoint?: string, missingField?: string, reason?: string }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'InsightInputError';
    this.code = meta.code ?? 'INSIGHT_INPUT_ERROR';
    this.entryPoint = meta.entryPoint;
    this.missingField = meta.missingField;
    this.reason = meta.reason;
  }
}

/**
 * True if `err` is an {@link InsightInputError} (handles duplicate-module instanceof misses).
 * @param {unknown} err
 * @returns {boolean}
 */
export function isInsightInputErrorLike(err) {
  if (err instanceof InsightInputError) return true;
  return (
    Boolean(err) &&
    typeof err === 'object' &&
    err.name === 'InsightInputError' &&
    err.code === 'INSIGHT_INPUT_ERROR'
  );
}

/**
 * Report / insight kinds that may attach device_maintenance_plan (device-scoped pipeline).
 * Excludes e.g. daily_tenant where "schedule" in copy must not map to maintenance.
 * @param {string|null|undefined} kind
 * @returns {boolean}
 */
export function kindAllowsDeviceMaintenancePlan(kind) {
  const k = String(kind || '').trim().toLowerCase();
  if (!k) return false;
  if (k === 'daily_device') return true;
  if (k.startsWith('device_')) return true;
  return false;
}

/**
 * @param {string|null|undefined} tags
 * @returns {boolean}
 */
function insightTagsIncludeDeviceIdTag(tags) {
  if (!tags || typeof tags !== 'string') return false;
  return /(?:^|,)\s*device:[^,\s]+/i.test(tags);
}

/**
 * Extract device id from TenantReport.tags convention: `device:<id>` (e.g. daily_device reports).
 * @param {string|null|undefined} tags
 * @returns {string|null}
 */
export function parseDeviceIdFromReportTags(tags) {
  if (!tags || typeof tags !== 'string') return null;
  const m = tags.match(/(?:^|,)\s*device:([^,\s]+)/i);
  return m && m[1] ? String(m[1]).trim() || null : null;
}

/**
 * Infer orchestrator entry point from insight data
 * 
 * @param {string|null} tags - Comma-separated tags
 * @param {string} kind - Insight kind (e.g., "daily_tenant", "campaign_performance")
 * @param {string} title - Insight title
 * @param {string} summaryMd - Insight summary markdown
 * @param {{ deviceId?: string|null }} [inferenceContext] — device_maintenance_plan only when deviceId is set
 * @returns {string|null} Entry point identifier or null
 */
export function inferEntryPointFromInsight(tags, kind, title, summaryMd, inferenceContext = {}) {
  if (!title && !summaryMd) {
    return null;
  }

  const deviceIdForInference =
    inferenceContext.deviceId != null && String(inferenceContext.deviceId).trim()
      ? String(inferenceContext.deviceId).trim()
      : null;

  const text = `${title} ${summaryMd || ''}`.toLowerCase();
  const tagList = tags ? tags.split(',').map((t) => t.trim().toLowerCase()) : [];

  // Device-related entry points
  if (
    text.includes('heartbeat') ||
    text.includes('device offline') ||
    text.includes('device status') ||
    tagList.some((t) => t.includes('device') && (t.includes('health') || t.includes('offline')))
  ) {
    return 'device_health_check';
  }

  if (
    text.includes('playlist assignment') ||
    text.includes('playlist frequency') ||
    tagList.some((t) => t.includes('playlist') && t.includes('assignment'))
  ) {
    return 'playlist_assignment_audit';
  }

  if (
    text.includes('maintenance') ||
    text.includes('schedule') ||
    tagList.some((t) => t.includes('maintenance'))
  ) {
    if (!deviceIdForInference) {
      return null;
    }
    if (!kindAllowsDeviceMaintenancePlan(kind) && !insightTagsIncludeDeviceIdTag(tags)) {
      return null;
    }
    return 'device_maintenance_plan';
  }

  if (
    text.includes('alert') ||
    text.includes('notification') ||
    tagList.some((t) => t.includes('alert'))
  ) {
    return 'device_alert_setup_heartbeats';
  }

  if (
    text.includes('monitoring') ||
    text.includes('operational protocol') ||
    tagList.some((t) => t.includes('monitoring'))
  ) {
    return 'device_monitoring_review';
  }

  // Campaign-related entry points
  const kindStr = String(kind || '');
  if (
    text.includes('campaign strategy') ||
    text.includes('previous campaign') ||
    kindStr.includes('campaign')
  ) {
    return 'campaign_strategy_review';
  }

  if (
    text.includes('device distribution') ||
    text.includes('screen distribution') ||
    text.includes('reallocate')
  ) {
    return 'screen_distribution_optimizer';
  }

  if (
    text.includes('targeting') ||
    text.includes('best-performing') ||
    text.includes('campaign targeting')
  ) {
    return 'campaign_targeting_planner';
  }

  if (
    text.includes('a/b') ||
    text.includes('ab test') ||
    text.includes('split test')
  ) {
    return 'campaign_ab_suggester';
  }

  if (
    text.includes('review schedule') ||
    text.includes('performance review') ||
    text.includes('regular review')
  ) {
    return 'campaign_review_scheduler';
  }

  // Studio/Content-related entry points
  if (
    text.includes('engagement campaign') ||
    text.includes('team members') ||
    text.includes('explore design')
  ) {
    return 'studio_engagement_campaign';
  }

  if (
    text.includes('training') ||
    text.includes('workshop') ||
    text.includes('tutorial')
  ) {
    return 'studio_training_guide';
  }

  if (
    text.includes('goal') ||
    text.includes('target') ||
    text.includes('objective')
  ) {
    return 'studio_goal_planner';
  }

  if (
    text.includes('content calendar') ||
    text.includes('calendar') ||
    text.includes('schedule content')
  ) {
    return 'content_calendar_builder';
  }

  // Default: no action
  return null;
}

/**
 * Build payload for a given entry point
 * 
 * @param {string} entryPoint - Entry point identifier
 * @param {string} tenantId - Tenant ID
 * @param {Object} context - Additional context (kind, reportId, etc.)
 * @returns {Object} Payload object
 */
export function buildPayloadForEntryPoint(entryPoint, tenantId, context = {}) {
  const { kind, reportId, deviceId, storeId } = context;

  const basePayload = { tenantId };

  switch (entryPoint) {
    // Device handlers
    case 'device_health_check':
      return {
        ...basePayload,
        scope: deviceId ? 'device' : storeId ? 'store' : 'tenant',
        deviceId: deviceId || undefined,
        storeId: storeId || undefined,
        lookbackMinutes: 60,
      };

    case 'playlist_assignment_audit':
      return {
        ...basePayload,
        deviceId: deviceId || undefined,
        storeId: storeId || undefined,
        windowHours: 24,
      };

    case 'device_maintenance_plan':
      if (!deviceId || String(deviceId).trim() === '') {
        throw new InsightInputError('deviceId is required for device_maintenance_plan', {
          entryPoint: 'device_maintenance_plan',
          missingField: 'deviceId',
          reason: 'device_maintenance_plan requires device-scoped report context',
        });
      }
      return {
        ...basePayload,
        deviceId,
        frequencyDays: 7,
        createCalendarEvents: false,
      };

    case 'device_alert_setup_heartbeats':
      return {
        ...basePayload,
        deviceIds: deviceId ? [deviceId] : undefined,
        offlineThresholdMinutes: 10,
        channels: ['dashboard'],
      };

    case 'device_monitoring_review':
      return {
        ...basePayload,
        includeChecklists: true,
      };

    // Campaign handlers
    case 'campaign_strategy_review':
      return {
        ...basePayload,
        lookbackDays: 30,
        limit: 10,
      };

    case 'screen_distribution_optimizer':
      return {
        ...basePayload,
        campaignId: context.campaignId || undefined,
        objective: 'balance',
      };

    case 'campaign_targeting_planner':
      return {
        ...basePayload,
        baseCampaignId: context.campaignId || undefined,
        goal: 'awareness',
      };

    case 'campaign_ab_suggester':
      return {
        ...basePayload,
        campaignId: context.campaignId || undefined,
        variants: 2,
      };

    case 'campaign_review_scheduler':
      return {
        ...basePayload,
        cadence: 'weekly',
      };

    // Studio/Content handlers
    case 'studio_engagement_campaign':
      return {
        ...basePayload,
        goal: 'activate_team',
        suggestedDurationDays: 7,
      };

    case 'studio_training_guide':
      return {
        ...basePayload,
        audience: 'owners',
        durationMinutes: 60,
      };

    case 'studio_goal_planner':
      return {
        ...basePayload,
        timeFrame: 'monthly',
        metrics: ['new_designs'],
      };

    case 'content_calendar_builder':
      return {
        ...basePayload,
        timeFrameDays: 30,
        channels: ['cnet'],
      };

    default:
      return basePayload;
  }
}

/**
 * Get navigation object for an entry point
 * 
 * @param {string} entryPoint - Orchestrator entry point
 * @returns {Object} Navigation object with href and label
 */
export function navigationFor(entryPoint) {
  switch (entryPoint) {
    case 'device_health_check':
    case 'playlist_assignment_audit':
    case 'device_monitoring_review':
      return { href: '/dashboard/devices/health', label: 'Open Devices' };

    case 'device_maintenance_plan':
      return { href: '/dashboard/devices/maintenance', label: 'Maintenance' };

    case 'device_alert_setup_heartbeats':
      return { href: '/dashboard/settings/alerts?tab=device', label: 'Alert Settings' };

    case 'campaign_strategy_review':
      return { href: '/dashboard/reports/campaigns', label: 'Campaign Reports' };

    case 'screen_distribution_optimizer':
      return { href: '/dashboard/insights/screens', label: 'Analyze Screens' };

    case 'campaign_targeting_planner':
      return { href: '/dashboard/campaigns/new', label: 'Create Campaign' };

    case 'campaign_ab_suggester':
      return { href: '/dashboard/campaigns/ab-test', label: 'A/B Testing' };

    case 'campaign_review_scheduler':
      return { href: '/dashboard/insights/performance', label: 'Performance Overview' };

    case 'studio_engagement_campaign':
      return { href: '/dashboard/campaigns/new?type=engagement', label: 'Launch Campaign' };

    case 'studio_training_guide':
      return { href: '/dashboard/studio/training', label: 'Training & Guides' };

    case 'studio_goal_planner':
      return { href: '/dashboard/studio/goals', label: 'Set Goals' };

    case 'content_calendar_builder':
      return { href: '/dashboard/studio/calendar', label: 'Open Calendar' };

    default:
      return { href: '/dashboard', label: 'Open Dashboard' };
  }
}

/**
 * Build an insight action object
 * 
 * @param {Object} options - Action options
 * @param {string} options.description - Action description
 * @param {string} options.entryPoint - Orchestrator entry point
 * @param {Object} options.payload - Entry point payload
 * @param {Object} options.navigation - Optional navigation object (auto-generated if not provided)
 * @param {string} options.source - Source context ("insight_card" | "report" | "pdf_preview")
 * @param {string} options.priority - Priority level ("primary" | "secondary")
 * @returns {Object} Action object with id, description, entryPoint, payload, navigation, source, priority
 */
export function buildInsightAction({ 
  description, 
  entryPoint, 
  payload, 
  navigation, 
  source = 'insight_card', 
  priority = 'secondary' 
}) {
  return {
    id: 'act_' + randomUUID(),
    description,
    entryPoint,
    payload,
    navigation: navigation || navigationFor(entryPoint),
    source,
    priority,
  };
}

