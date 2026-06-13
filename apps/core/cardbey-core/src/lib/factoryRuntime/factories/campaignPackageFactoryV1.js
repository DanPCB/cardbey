/**
 * campaign_package_factory_v1 — tool-only factory proof (no creative coupling).
 */

/** @type {import('../factoryDefinition.js').FactoryDefinitionSchema extends import('zod').ZodType<infer T> ? T : never} */
export const campaignPackageFactoryV1 = {
  factoryId: 'campaign_package_factory_v1',
  version: '1.0.0',
  name: 'Campaign Package Factory V1',
  description: 'Market research → offer draft → approve → package → artifact.',
  inputSchema: {
    intent: { type: 'string', required: true },
    storeId: { type: 'string', optional: true },
  },
  approvalPolicy: {
    mode: 'per_stage',
    defaultStatus: 'awaiting_factory_approval',
    approvalStageId: 'approval',
    planOutputPath: 'stageOutputs.create_offer_draft.offerDraft',
    mergeStrategy: 'shallow_merge_plan',
    editableFields: ['title', 'offerCopy', 'cta'],
  },
  artifactPolicy: {
    artifactType: 'campaign_package',
    artifactTypeResolver: 'from_output',
    finalizeStageId: 'artifact_finalize',
    sourceStageIds: ['package_campaign_artifact'],
    requiredFields: [],
    persist: true,
  },
  stages: [
    {
      stageId: 'market_research',
      agentRole: 'researcher',
      toolName: 'market_research',
      inputMapping: {
        storeId: '$.context.storeId',
        focus: '$.intent',
      },
      outputMapping: {
        marketReport: 'marketReport',
      },
      timeoutMs: 120_000,
    },
    {
      stageId: 'create_offer_draft',
      agentRole: 'planner',
      toolName: 'create_offer_draft',
      inputMapping: {
        storeId: '$.context.storeId',
        missionId: '$.context.missionId',
      },
      outputMapping: {
        offerDraft: 'offerDraft',
      },
      requiredArtifacts: ['offerDraft'],
      timeoutMs: 90_000,
    },
    {
      stageId: 'approval',
      agentRole: 'human',
      requiresApproval: true,
      requiredArtifacts: ['offerDraft'],
    },
    {
      stageId: 'package_campaign_artifact',
      agentRole: 'packager',
      toolName: 'package_campaign_artifact',
      inputMapping: {
        storeId: '$.context.storeId',
        brief: {
          objective: '$.stageOutputs.market_research.marketReport.marketContext.recommendedCampaignAngle',
        },
        copy: {
          headline: '$.stageOutputs.create_offer_draft.offerDraft.title',
          body: '$.stageOutputs.create_offer_draft.offerDraft.offerCopy',
        },
        graphics: [{ url: 'https://cdn.cardbey.local/factory/campaign-placeholder.png' }],
      },
      outputMapping: {
        artifact: 'artifact',
      },
      timeoutMs: 60_000,
    },
    {
      stageId: 'artifact_finalize',
      agentRole: 'finalizer',
      timeoutMs: 30_000,
    },
  ],
};
