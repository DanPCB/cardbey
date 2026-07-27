/**
 * Upload-specific belief gates — avoid treating governed tool confirmations as upload clarify.
 */

/**
 * @param {import('./constants.js').BeliefWorkflow | null | undefined} workflow
 * @param {Record<string, unknown> | null | undefined} [workflowCtx]
 */
export function isUploadPendingConfirmationWorkflow(workflow, workflowCtx = null) {
  if (!workflow || workflow.status !== 'pending_confirmation') return false;
  const type = String(workflow.type ?? '').trim();
  const source = String(workflow.source ?? '').trim();
  if (type === 'upload_intake') return true;
  if (type === 'store_creation' && source === 'uploaded_asset') return true;
  if (workflowCtx?.uploadedAsset != null && typeof workflowCtx.uploadedAsset === 'object') {
    return true;
  }
  return false;
}

/**
 * Active non-upload goals supersede stale upload clarify from prior turns.
 * @param {import('./constants.js').BeliefActiveGoal | null | undefined} activeGoal
 */
export function activeGoalSupersedesUploadClarify(activeGoal) {
  const intent = String(activeGoal?.intent ?? '').trim();
  if (!intent) return false;
  if (intent === 'create_store_from_upload' || intent === 'analyze_asset') return false;
  if (/^ingest_/.test(intent)) return false;
  return true;
}
