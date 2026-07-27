/**
 * Structured fact types — system-owned truth for Performer explanation.
 */

export const FACT_TYPES = {
  STORE_CREATED: 'store_created',
  ENTITY_CONFLICT: 'entity_conflict',
  VALIDATION_ERROR: 'validation_error',
  PERMISSION_DENIED: 'permission_denied',
  ACTION_SUCCEEDED: 'action_succeeded',
  ACTION_FAILED: 'action_failed',
  REQUIRES_INPUT: 'requires_input',
  REQUIRES_CONFIRMATION: 'requires_confirmation',
  PROGRESS_UPDATE: 'progress_update',
  INFORMATION: 'information',
};

export class StructuredFact {
  /**
   * @param {{
   *   event: string;
   *   entityType?: string | null;
   *   reason?: string | null;
   *   data?: Record<string, unknown>;
   *   allowedActions?: string[];
   *   metadata?: Record<string, unknown>;
   * }} input
   */
  constructor({ event, entityType, reason, data, allowedActions, metadata }) {
    this.event = event;
    this.entityType = entityType || null;
    this.reason = reason || null;
    this.data = data || {};
    this.allowedActions = allowedActions || [];
    this.metadata = metadata || {};
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      event: this.event,
      entityType: this.entityType,
      reason: this.reason,
      data: this.data,
      allowedActions: this.allowedActions,
      metadata: this.metadata,
      timestamp: this.timestamp,
    };
  }
}
