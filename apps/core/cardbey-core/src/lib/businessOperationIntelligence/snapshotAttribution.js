/**
 * Minimal Marketing Operations attribution hooks for Business Operation Intelligence.
 * Extends canonical events; never creates a parallel funnel.
 */

import {
  CANONICAL_EVENTS,
  recordCanonicalEvent,
  extractAttrContext,
} from '../../services/marketingOperations/index.js';

/**
 * Best-effort record. Never throws. Skips when attribution spine disabled / no context.
 * @param {object} req
 * @param {string} eventType
 * @param {object} [metadata]
 */
export async function recordBusinessOperationEvent(req, eventType, metadata = {}) {
  try {
    return await recordCanonicalEvent({
      req,
      eventType,
      metadata: {
        surface: 'business_operation_intelligence',
        phase: metadata.phase || null,
        ...metadata,
      },
      anonymousId: metadata.anonymousId,
      userId: metadata.userId,
      storeId: metadata.storeId,
      correlationId: metadata.correlationId,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[business-operation] attribution skipped:', err?.message || err);
    }
    return { ok: false, skipped: true, reason: 'exception' };
  }
}

export const BUSINESS_OPERATION_EVENTS = Object.freeze({
  ANALYSIS_STARTED: CANONICAL_EVENTS.BUSINESS_ANALYSIS_STARTED,
  CONTEXT_CONFIRMED: CANONICAL_EVENTS.BUSINESS_CONTEXT_CONFIRMED,
  SNAPSHOT_COMPLETED: CANONICAL_EVENTS.BUSINESS_SNAPSHOT_COMPLETED,
  SNAPSHOT_VIEWED: CANONICAL_EVENTS.BUSINESS_SNAPSHOT_VIEWED,
  FULL_ANALYSIS_STARTED: CANONICAL_EVENTS.BUSINESS_FULL_ANALYSIS_STARTED,
  FULL_ANALYSIS_COMPLETED: CANONICAL_EVENTS.BUSINESS_FULL_ANALYSIS_COMPLETED,
  GROWTH_PLAN_VIEWED: CANONICAL_EVENTS.BUSINESS_GROWTH_PLAN_VIEWED,
  LANDING_VIEWED: CANONICAL_EVENTS.BUSINESS_OPERATION_LANDING_VIEWED,
  FULL_ANALYSIS_PREVIEW_VIEWED: CANONICAL_EVENTS.BUSINESS_FULL_ANALYSIS_PREVIEW_VIEWED,
  FULL_ANALYSIS_UNLOCK_CLICKED: CANONICAL_EVENTS.BUSINESS_FULL_ANALYSIS_UNLOCK_CLICKED,
  FULL_ANALYSIS_PILOT_INTEREST: CANONICAL_EVENTS.BUSINESS_FULL_ANALYSIS_PILOT_INTEREST,
  FEEDBACK: CANONICAL_EVENTS.BUSINESS_OPERATION_FEEDBACK,
});

/** Client-allowed public funnel events (no payment / no PII required). */
export const BUSINESS_OPERATION_PUBLIC_CLIENT_EVENTS = Object.freeze([
  BUSINESS_OPERATION_EVENTS.LANDING_VIEWED,
  BUSINESS_OPERATION_EVENTS.FULL_ANALYSIS_PREVIEW_VIEWED,
  BUSINESS_OPERATION_EVENTS.FULL_ANALYSIS_UNLOCK_CLICKED,
  BUSINESS_OPERATION_EVENTS.FEEDBACK,
]);

export { extractAttrContext };
