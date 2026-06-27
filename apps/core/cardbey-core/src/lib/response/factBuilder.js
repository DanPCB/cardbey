/**
 * Builds structured facts from system events — no user-facing prose.
 */

import { FACT_TYPES, StructuredFact } from './factTypes.js';

export class FactBuilder {
  /**
   * @param {string} storeId
   * @param {string} storeName
   */
  static storeCreated(storeId, storeName) {
    return new StructuredFact({
      event: FACT_TYPES.STORE_CREATED,
      entityType: 'store',
      data: { storeId, storeName, createdAt: new Date().toISOString() },
      allowedActions: ['open_store', 'add_product', 'create_campaign', 'publish_store'],
    });
  }

  /**
   * Store mission / checkpoint pipeline started (build in progress).
   * @param {object} input
   */
  static storeMissionStarted(input = {}) {
    const {
      missionId,
      storeName,
      intentMode = 'store',
      businessType,
      location,
      mode,
      jobId,
      generationRunId,
      draftId,
    } = input;
    return new StructuredFact({
      event: FACT_TYPES.ACTION_SUCCEEDED,
      entityType: 'store',
      reason: 'store_mission_started',
      data: {
        missionId,
        storeName,
        intentMode,
        businessType,
        location,
        mode,
        jobId,
        generationRunId,
        draftId,
      },
      allowedActions: ['open_store', 'add_product', 'create_campaign', 'add_special_requirements'],
    });
  }

  /**
   * @param {string} existingStoreId
   * @param {string} existingStoreName
   */
  static duplicateStore(existingStoreId, existingStoreName) {
    return new StructuredFact({
      event: FACT_TYPES.ENTITY_CONFLICT,
      entityType: 'store',
      reason: 'duplicate_name',
      data: {
        existingEntity: { id: existingStoreId, name: existingStoreName },
        suggestedNames: null,
      },
      allowedActions: ['open_existing', 'edit_details', 'create_another'],
    });
  }

  /**
   * @param {Array<{ field: string; message: string; code?: string; suggestion?: string; errorAction?: string }>} fields
   */
  static validationError(fields) {
    return new StructuredFact({
      event: FACT_TYPES.VALIDATION_ERROR,
      entityType: 'input',
      reason: 'missing_or_invalid_fields',
      data: { fields },
      allowedActions: ['edit_details', 'cancel'],
    });
  }

  /**
   * @param {string} reason
   * @param {string} requiredAction
   */
  static permissionDenied(reason, requiredAction) {
    return new StructuredFact({
      event: FACT_TYPES.PERMISSION_DENIED,
      entityType: 'user',
      reason,
      data: { requiredAction },
      allowedActions: ['sign_in', 'continue_as_guest', 'cancel'],
    });
  }

  /**
   * @param {string} action
   * @param {Record<string, unknown>} result
   */
  static actionSucceeded(action, result) {
    return new StructuredFact({
      event: FACT_TYPES.ACTION_SUCCEEDED,
      entityType: 'action',
      reason: 'completed_successfully',
      data: { action, result },
      allowedActions: ['continue', 'view_details', 'start_next'],
    });
  }

  /**
   * @param {string} action
   * @param {string} reason
   * @param {Record<string, unknown>} details
   */
  static actionFailed(action, reason, details) {
    return new StructuredFact({
      event: FACT_TYPES.ACTION_FAILED,
      entityType: 'action',
      reason,
      data: { action, details },
      allowedActions: ['retry', 'edit', 'cancel'],
    });
  }

  /**
   * @param {string} prompt
   * @param {string} inputType
   * @param {unknown} options
   */
  static requiresInput(prompt, inputType, options) {
    return new StructuredFact({
      event: FACT_TYPES.REQUIRES_INPUT,
      entityType: 'input',
      reason: 'user_input_needed',
      data: { prompt, inputType, options },
      allowedActions: ['provide_input', 'skip', 'cancel'],
    });
  }

  /**
   * @param {string} step
   * @param {number} progress
   * @param {string | null} message
   */
  static progressUpdate(step, progress, message) {
    return new StructuredFact({
      event: FACT_TYPES.PROGRESS_UPDATE,
      entityType: 'mission',
      reason: 'step_completed',
      data: { step, progress, message },
      allowedActions: ['continue', 'view_details'],
    });
  }
}
