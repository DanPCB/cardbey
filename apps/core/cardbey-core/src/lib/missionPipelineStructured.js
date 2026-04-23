/**
 * Structured mission steps (Phase 3): checkpoints + conditionals for store / campaign pipelines.
 * Consumed only by missionPipelineService when materializing MissionPipelineStep rows.
 * Execution stays in runNextMissionPipelineStep + runMissionUntilBlocked (single runner).
 */

/**
 * @returns {Array<{
 *   orderIndex: number,
 *   toolName: string,
 *   label: string,
 *   stepKind: 'action' | 'checkpoint' | 'conditional',
 *   configJson?: object,
 *   inputJson?: object,
 * }>}
 */
export function getStructuredMissionSteps(missionType) {
  const t = typeof missionType === 'string' ? missionType.trim().toLowerCase() : '';
  if (t === 'store') {
    return [
      {
        orderIndex: 0,
        stepKind: 'checkpoint',
        toolName: 'mission.checkpoint',
        label: 'Logo',
        configJson: {
          prompt: 'Would you like to upload a logo for your store?',
          options: ['Upload now', 'Skip', 'Choose from library'],
          outputKey: 'logoChoice',
        },
      },
      {
        orderIndex: 1,
        stepKind: 'conditional',
        toolName: 'mission.conditional',
        label: 'Logo path',
        configJson: {
          condition: 'logoChoice === "Upload now"',
          ifTrueTool: 'mission_pipeline_stub',
          ifFalseTool: 'mission_pipeline_stub',
          ifTrueInput: { branch: 'upload', label: 'await_logo_upload' },
          ifFalseInput: { branch: 'default', label: 'assign_default_logo' },
        },
      },
      {
        orderIndex: 2,
        stepKind: 'checkpoint',
        toolName: 'mission.checkpoint',
        label: 'Hero image',
        configJson: {
          prompt: 'Here are 3 hero images for your store. Which fits best?',
          options: ['Image 1', 'Image 2', 'Image 3', 'Generate new'],
          outputKey: 'heroImageChoice',
        },
      },
      {
        orderIndex: 3,
        stepKind: 'action',
        toolName: 'structured_store_build',
        label: 'Generate store draft',
      },
      {
        orderIndex: 4,
        stepKind: 'action',
        toolName: 'analyze_store',
        label: 'Review store',
      },
    ];
  }
  if (t === 'launch_campaign') {
    return [
      { orderIndex: 0, stepKind: 'action', toolName: 'market_research', label: 'Research' },
      {
        orderIndex: 1,
        stepKind: 'checkpoint',
        toolName: 'mission.checkpoint',
        label: 'Featured product',
        configJson: {
          prompt: 'Which product would you like to feature?',
          options: ['Top seller', 'New arrival', 'Custom — pick in catalog'],
          outputKey: 'featuredProductId',
          dynamicOptions: 'store.getProducts',
        },
      },
      { orderIndex: 2, stepKind: 'action', toolName: 'create_promotion', label: 'Create creative' },
      {
        orderIndex: 3,
        stepKind: 'checkpoint',
        toolName: 'mission.checkpoint',
        label: 'Launch review',
        configJson: {
          prompt: 'Review your campaign creative. Ready to launch?',
          options: ['Launch now', 'Edit first', 'Cancel'],
          outputKey: 'launchDecision',
        },
      },
      {
        orderIndex: 4,
        stepKind: 'conditional',
        toolName: 'mission.conditional',
        label: 'Launch or save',
        configJson: {
          condition: 'launchDecision === "Launch now"',
          ifTrueTool: 'mission_pipeline_stub',
          ifFalseTool: 'mission_pipeline_stub',
          ifTrueInput: { branch: 'launch', label: 'campaign_publish' },
          ifFalseInput: { branch: 'draft', label: 'campaign_save_draft' },
        },
      },
    ];
  }
  return [];
}
