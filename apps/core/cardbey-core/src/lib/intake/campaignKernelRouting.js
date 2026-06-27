/**
 * Campaign kernel routing — maps legacy proactive_plan campaign tools to checkpoint pipeline.
 */

/** Tools that must route through create_campaign kernel checkpoint pipeline. */
export const CAMPAIGN_CHECKPOINT_KERNEL_TOOLS = new Set([
  'create_campaign',
  'launch_campaign',
  'activate_campaigns',
]);

/**
 * @param {string} [toolName]
 * @returns {boolean}
 */
export function isCampaignCheckpointKernelTool(toolName) {
  return CAMPAIGN_CHECKPOINT_KERNEL_TOOLS.has(String(toolName ?? '').trim());
}

/**
 * Normalize campaign classifications to kernel_dispatch + create_campaign.
 *
 * @param {object | null | undefined} classification
 * @returns {object | null | undefined}
 */
export function normalizeCampaignClassificationForKernel(classification) {
  if (!classification || typeof classification !== 'object') return classification;
  if (!isCampaignCheckpointKernelTool(classification.tool)) return classification;

  const parameters =
    classification.parameters && typeof classification.parameters === 'object' && !Array.isArray(classification.parameters)
      ? { ...classification.parameters }
      : {};

  if (classification.tool === 'launch_campaign' || classification.tool === 'activate_campaigns') {
    parameters._sourceTool = classification.tool;
  }

  return {
    ...classification,
    executionPath: 'kernel_dispatch',
    tool: 'create_campaign',
    parameters,
    _kernelNormalizedFrom: classification.executionPath ?? 'proactive_plan',
    _classificationSource: classification._classificationSource ?? 'campaign_kernel',
  };
}
