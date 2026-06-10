/**
 * Factual learned signals from business memory rows (no advice).
 */

function actionTypeLabel(actionType) {
  return String(actionType ?? 'action').trim() || 'action';
}

/**
 * @param {object} input
 * @param {Array<{ decision: string; opportunityEvent?: { category?: string } }>} input.decisions
 * @param {Array<{ actionType: string; status: string; updatedAt?: Date|string }>} input.actions
 * @param {Array<{ outcomeType: string; actionEvent?: { actionType?: string } }>} input.outcomes
 */
export function buildLearnedSignals({ decisions = [], actions = [], outcomes = [] }) {
  const signals = [];

  const completed = actions.find((a) => a.status === 'completed');
  if (completed) {
    signals.push(`Last ${actionTypeLabel(completed.actionType)} action completed successfully.`);
  }

  const failed = actions.find((a) => a.status === 'failed');
  if (failed) {
    signals.push(`Last ${actionTypeLabel(failed.actionType)} mission failed.`);
  }

  const cancelled = actions.find((a) => a.status === 'cancelled');
  if (cancelled && !failed) {
    signals.push(`Last ${actionTypeLabel(cancelled.actionType)} mission was cancelled.`);
  }

  const dismissedByCategory = new Map();
  for (const d of decisions) {
    if (d.decision !== 'dismissed') continue;
    const category = d.opportunityEvent?.category ?? 'recommendation';
    dismissedByCategory.set(category, (dismissedByCategory.get(category) ?? 0) + 1);
  }
  for (const [category, count] of dismissedByCategory.entries()) {
    if (count > 0) {
      const label = category === 'loyalty' ? 'loyalty recommendations' : `${category} recommendations`;
      signals.push(`Owner dismissed ${label} ${count} time${count === 1 ? '' : 's'}.`);
    }
  }

  const latestOutcome = outcomes[0];
  if (latestOutcome?.outcomeType) {
    const type = String(latestOutcome.outcomeType);
    if (type === 'offer_created') signals.push('Most recent outcome: offer created.');
    else if (type === 'campaign_created') signals.push('Most recent outcome: campaign created.');
    else if (type === 'video_generated') signals.push('Most recent outcome: video generated.');
    else if (type === 'profile_updated') signals.push('Most recent outcome: profile updated.');
    else if (type === 'catalog_updated') signals.push('Most recent outcome: catalog updated.');
    else if (type === 'mission_failed') signals.push('Most recent outcome: mission failed.');
    else if (type === 'mission_cancelled') signals.push('Most recent outcome: mission cancelled.');
  }

  return signals;
}

/**
 * Infer factual outcome type from mission terminal status and action type.
 * @param {object} params
 * @param {string} params.actionType
 * @param {string} params.missionStatus
 * @param {object|null} [params.missionOutputs]
 */
export function inferBusinessOutcomeType({ actionType, missionStatus, missionOutputs = null }) {
  const status = String(missionStatus ?? '').toLowerCase();
  if (status === 'cancelled' || status === 'canceled') return 'mission_cancelled';
  if (status === 'failed') return 'mission_failed';
  if (status !== 'completed') return 'mission_in_progress';

  const outputs = missionOutputs && typeof missionOutputs === 'object' ? missionOutputs : {};
  const type = String(actionType ?? '').trim();

  if (type === 'create_offer') {
    if (outputs.promotionId || outputs.campaignArtifactV1?.promotionId) return 'offer_created';
    return 'offer_created';
  }
  if (type === 'launch_campaign') {
    if (outputs.campaignArtifactV1 || outputs.campaign_plan) return 'campaign_created';
    return 'campaign_created';
  }
  if (type === 'generate_video') return 'video_generated';
  if (type === 'complete_profile') return 'profile_updated';
  if (type === 'add_catalog_items') return 'catalog_updated';
  if (type === 'create_loyalty_program') return 'loyalty_program_created';
  if (type === 'resume_mission') return 'mission_resumed';
  if (type === 'review_store') return 'store_reviewed';
  return 'mission_completed';
}
