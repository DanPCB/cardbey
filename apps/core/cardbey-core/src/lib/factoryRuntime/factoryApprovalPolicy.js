/**
 * Definition-driven factory approval plan merge.
 */

import { getPath, setPath } from './factoryPathUtils.js';

/**
 * @param {object|null|undefined} definition
 */
export function resolveApprovalPolicy(definition) {
  const policy = definition?.approvalPolicy;
  if (!policy || typeof policy !== 'object') {
    return {
      approvalStageId: 'approval',
      planOutputPath: null,
      mergeStrategy: 'replace_plan',
      editableFields: [],
    };
  }
  return {
    approvalStageId: policy.approvalStageId ?? 'approval',
    planOutputPath: policy.planOutputPath ?? null,
    mergeStrategy: policy.mergeStrategy ?? 'replace_plan',
    editableFields: Array.isArray(policy.editableFields) ? policy.editableFields : [],
  };
}

/**
 * @param {object} state
 * @param {object|null|undefined} definition
 */
export function resolvePlanFromState(state, definition) {
  const { planOutputPath } = resolveApprovalPolicy(definition);
  if (planOutputPath) {
    return getPath(state, planOutputPath) ?? null;
  }
  return null;
}

/**
 * @param {object} state
 * @param {object|null|undefined} definition
 * @param {object} editedPlan
 */
export function mergeApprovedPlanIntoState(state, definition, editedPlan) {
  const policy = resolveApprovalPolicy(definition);
  if (!policy.planOutputPath || !editedPlan || typeof editedPlan !== 'object') {
    return state;
  }

  const current = getPath(state, policy.planOutputPath);
  let merged = editedPlan;

  switch (policy.mergeStrategy) {
    case 'shallow_merge_plan':
      merged = {
        ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
        ...editedPlan,
      };
      break;
    case 'append_notes': {
      const notes =
        typeof editedPlan.notes === 'string'
          ? editedPlan.notes
          : typeof editedPlan.approvalNotes === 'string'
            ? editedPlan.approvalNotes
            : '';
      merged = {
        ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
        approvalNotes: notes,
      };
      break;
    }
    case 'replace_plan':
    default:
      merged = editedPlan;
      break;
  }

  const next = { ...state, stageOutputs: { ...(state.stageOutputs ?? {}) } };
  setPath(next, policy.planOutputPath, merged);

  // Keep stage bucket in sync when plan lives under stageOutputs.<stageId>.*
  const parts = policy.planOutputPath.split('.');
  if (parts[0] === 'stageOutputs' && parts.length >= 2) {
    const stageId = parts[1];
    const leaf = parts[parts.length - 1];
    const bucket = { ...(next.stageOutputs[stageId] ?? {}) };
    bucket[leaf] = merged;
    if (leaf === 'videoPlan') bucket.plan = merged;
    if (leaf === 'plan') bucket.plan = merged;
    if (leaf === 'offerDraft') bucket.offerDraft = merged;
    next.stageOutputs[stageId] = bucket;
  }

  return next;
}
