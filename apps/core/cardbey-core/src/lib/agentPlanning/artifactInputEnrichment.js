/**
 * Chains prior step outputs into downstream tool inputs (Content Studio / campaign runway).
 * Called from missionPipelineRunner after buildStepInput; keyed by toolName in stepOutputs.
 */

/**
 * @param {string} toolName
 * @param {Record<string, object>} input
 * @param {Record<string, object>} stepOutputs
 * @returns {Record<string, object>}
 */
export function enrichStepInputFromPriorOutputs(toolName, input, stepOutputs) {
  const out = { ...input };
  if (!toolName || !stepOutputs || typeof stepOutputs !== 'object') return out;

  const research =
    stepOutputs.market_research ||
    stepOutputs.campaign_research ||
    null;
  if (research && typeof research === 'object') {
    if (
      toolName === 'create_promotion' ||
      toolName === 'content_creator' ||
      toolName === 'consensus'
    ) {
      if (research.targetAudience != null)
        out.targetAudience = out.targetAudience ?? research.targetAudience;
      if (research.marketReport != null)
        out.marketReport = out.marketReport ?? research.marketReport;
      if (research.summary != null)
        out.campaignBrief = out.campaignBrief ?? research.summary;
    }
  }

  const structured = stepOutputs.structured_store_build;
  if (structured && typeof structured === 'object' && toolName === 'analyze_store') {
    const flat =
      structured.output && typeof structured.output === 'object' ? structured.output : structured;
    if (flat.generationRunId) out.generationRunId = out.generationRunId ?? flat.generationRunId;
    if (flat.draftId) out.draftId = out.draftId ?? flat.draftId;
    if (flat.storeId) out.storeId = out.storeId ?? flat.storeId;
    if (flat.storeSlug) out.storeSlug = out.storeSlug ?? flat.storeSlug;
  }

  const created = stepOutputs.create_promotion;
  if (created && typeof created === 'object') {
    const pid = created.promotionId || created.instanceId;
    if (pid) {
      const needsPromo = [
        'activate_promotion',
        'assign_promotion_slot',
        'generate_promotion_asset',
        'content_creator',
        'crm',
      ];
      if (needsPromo.includes(toolName)) {
        out.promotionId = out.promotionId ?? pid;
        out.instanceId = out.instanceId ?? pid;
      }
    }
  }

  return out;
}
