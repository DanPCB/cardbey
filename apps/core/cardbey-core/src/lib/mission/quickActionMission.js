/**
 * ============================================================
 * QUICK ACTION MISSION CREATOR
 * ============================================================
 *
 * Creates MissionPipeline rows when quick actions arrive without missionId.
 */

import { createMissionPipeline } from '../missionPipelineService.js';
import { insertMissingPipelineSteps } from '../missionPipelineStepWriter.js';
import { mergeProactivePlanBundleIntoMetadata } from '../runtime/runtimeOrchestrationState.js';
import { getContextProvider } from '../context/contextEngine.js';
import { isContextEngineEnabled } from '../context/contextEngine.js';

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Quick-action mission auto-creation is enabled unless explicitly disabled.
 */
export function isQuickActionMissionCreationEnabled() {
  return String(process.env.DISABLE_QUICK_ACTION_MISSION_CREATION ?? '').trim().toLowerCase() !== 'true';
}

/**
 * @param {string | null | undefined} actionType
 */
export function mapActionTypeToMissionType(actionType) {
  const key = str(actionType).toLowerCase() || 'default';
  const mapping = {
    create_offer: 'launch_campaign',
    create_offer_draft: 'launch_campaign',
    create_campaign: 'launch_campaign',
    launch_campaign: 'launch_campaign',
    generate_graphic: 'create_promotion',
    create_promotion_graphic: 'create_promotion',
    add_product: 'store_improvement',
    create_store: 'store',
    publish_store: 'store',
    upload_asset: 'store_improvement',
    default: 'generic',
  };
  return mapping[key] ?? mapping.default;
}

/**
 * @param {string | null | undefined} actionType
 * @param {string | null | undefined} storeId
 */
export function getStepsForActionType(actionType, storeId = null) {
  const key = str(actionType).toLowerCase() || 'default';
  const storeRef = storeId ? { storeId } : {};

  switch (key) {
    case 'create_offer':
    case 'create_offer_draft':
      return [
        {
          id: 'step_1',
          kind: 'action',
          tool: 'analyze_store',
          order: 1,
          labels: { en: 'Analyzing store...', vi: 'Đang phân tích cửa hàng...' },
        },
        {
          id: 'step_2',
          kind: 'action',
          tool: 'create_promotion',
          order: 2,
          labels: { en: 'Creating offer draft...', vi: 'Đang tạo bản nháp ưu đãi...' },
          input: storeRef,
        },
      ];

    case 'create_promotion_graphic':
    case 'generate_graphic':
      return [
        {
          id: 'step_1',
          kind: 'action',
          tool: 'analyze_store',
          order: 1,
          labels: { en: 'Validating store...', vi: 'Đang xác thực cửa hàng...' },
        },
        {
          id: 'step_2',
          kind: 'action',
          tool: 'create_promotion_graphic',
          order: 2,
          labels: { en: 'Generating promotion graphic...', vi: 'Đang tạo đồ họa khuyến mãi...' },
          input: { ...storeRef, type: 'promotion' },
        },
        {
          id: 'step_3',
          kind: 'checkpoint',
          tool: 'create_promotion_graphic',
          order: 3,
          labels: { en: 'Review graphic...', vi: 'Xem lại đồ họa...' },
          config: {
            type: 'review',
            prompt: 'Review your promotion graphic',
            required: true,
          },
        },
      ];

    case 'create_campaign':
    case 'launch_campaign':
      return [
        {
          id: 'step_1',
          kind: 'action',
          tool: 'analyze_store',
          order: 1,
          labels: { en: 'Validating store...', vi: 'Đang xác thực cửa hàng...' },
        },
        {
          id: 'step_2',
          kind: 'action',
          tool: 'create_campaign',
          order: 2,
          labels: { en: 'Creating campaign...', vi: 'Đang tạo chiến dịch...' },
          input: storeRef,
        },
        {
          id: 'step_3',
          kind: 'checkpoint',
          tool: 'launch_campaign',
          order: 3,
          labels: { en: 'Review campaign...', vi: 'Xem lại chiến dịch...' },
          config: {
            type: 'review',
            prompt: 'Review your campaign before launching',
            required: true,
          },
        },
        {
          id: 'step_4',
          kind: 'action',
          tool: 'launch_campaign',
          order: 4,
          labels: { en: 'Launching campaign...', vi: 'Đang phát hành chiến dịch...' },
        },
      ];

    default:
      return [
        {
          id: 'step_1',
          kind: 'action',
          tool: 'general_chat',
          order: 1,
          labels: { en: 'Processing request...', vi: 'Đang xử lý yêu cầu...' },
        },
      ];
  }
}

/**
 * @param {Array<ReturnType<typeof getStepsForActionType>[number]>} steps
 */
function stepsToProactivePlan(steps) {
  return steps.map((step) => ({
    step: step.order,
    title: step.labels?.en ?? `Step ${step.order}`,
    description: step.config?.prompt ?? step.labels?.en ?? '',
    recommendedTool: step.tool,
    planRole: step.kind === 'checkpoint' ? 'checkpoint' : 'action',
    parameters: step.input && typeof step.input === 'object' ? step.input : {},
    dynamicStepId: step.id,
    checkpoint: step.config ?? null,
  }));
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @param {Array<ReturnType<typeof getStepsForActionType>[number]>} steps
 */
export async function generateQuickActionPlan({ missionId, actionType, storeId, prisma }) {
  const mid = str(missionId);
  if (!mid || !prisma) return [];

  const steps = getStepsForActionType(actionType, storeId);
  const rows = steps.map((step) => ({
    missionId: mid,
    orderIndex: Math.max(0, (step.order ?? 1) - 1),
    toolName: step.tool,
    label: step.labels?.en ?? `Step ${step.order}`,
    status: 'pending',
    stepKind: step.kind === 'checkpoint' ? 'checkpoint' : 'action',
    configJson: {
      quickActionStepId: step.id,
      ...(step.config ? { checkpoint: step.config } : {}),
    },
    ...(step.input && typeof step.input === 'object' ? { inputJson: step.input } : {}),
  }));

  await insertMissingPipelineSteps(prisma, mid, rows, { logPrefix: '[QuickActionMission]' });
  await prisma.missionPipeline.update({
    where: { id: mid },
    data: { progressTotalSteps: steps.length },
  });

  return steps;
}

/**
 * @param {Object} params
 * @param {string} params.storeId
 * @param {string} [params.actionType]
 * @param {string} [params.source]
 * @param {string} [params.intentText]
 * @param {string} [params.label]
 * @param {string | null} [params.userId]
 * @param {string | null} [params.sessionId]
 * @param {string | null} [params.tenantId]
 * @param {string | null} [params.storeName]
 * @param {import('@prisma/client').PrismaClient} [params.prisma]
 * @param {import('../context/contextProvider.js').ContextProvider | null} [params.contextProvider]
 */
export async function createMissionFromQuickAction({
  storeId,
  actionType = 'create_offer',
  source = 'quick_action_pill',
  intentText,
  label,
  userId = null,
  sessionId = null,
  tenantId = null,
  storeName = null,
  prisma = null,
  contextProvider = null,
}) {
  const storeIdTrimmed = str(storeId);
  if (!storeIdTrimmed) {
    throw new Error('storeId is required to create a quick-action mission');
  }

  const actionKey = str(actionType) || 'create_offer';
  const missionType = mapActionTypeToMissionType(actionKey);
  const title =
    str(label) || str(intentText) || `Quick action: ${actionKey.replace(/_/g, ' ')}`;
  const createdBy = str(userId) || 'guest';
  const tenant = str(tenantId) || (createdBy !== 'guest' ? createdBy : 'temp');

  const proactiveSteps = stepsToProactivePlan(getStepsForActionType(actionKey, storeIdTrimmed));
  const metadata = mergeProactivePlanBundleIntoMetadata(
    {
      storeId: storeIdTrimmed,
      actionType: actionKey,
      source: str(source) || 'quick_action_pill',
      intentText: str(intentText) || null,
      label: title,
      createdAt: new Date().toISOString(),
      createdBy,
      quickAction: true,
    },
    { planSteps: proactiveSteps, planParameters: { storeId: storeIdTrimmed } },
  );

  const pipeline = await createMissionPipeline({
    type: missionType,
    title: title.slice(0, 200),
    targetType: 'store',
    targetId: storeIdTrimmed,
    targetLabel: str(storeName) || null,
    metadata,
    requiresConfirmation: false,
    executionMode: 'GUIDED_RUN',
    tenantId: tenant,
    createdBy,
  });

  if (prisma) {
    await generateQuickActionPlan({
      missionId: pipeline.id,
      actionType: actionKey,
      storeId: storeIdTrimmed,
      prisma,
    });
  }

  const uid = str(userId);
  const sid = str(sessionId);
  const provider = contextProvider ?? (isContextEngineEnabled() ? getContextProvider() : null);
  if (provider && uid && sid) {
    try {
      await provider.updateContext(uid, sid, {
        activeMissionId: pipeline.id,
        activeStoreId: storeIdTrimmed,
        currentWorkflow: missionType,
        currentStepId: null,
      });
      console.log(`[quickActionMission] Context updated with mission ${pipeline.id}`);
    } catch (err) {
      console.warn('[quickActionMission] Context update failed (non-blocking):', err?.message ?? err);
    }
  }

  console.log(`[quickActionMission] Created mission ${pipeline.id} for action ${actionKey}`);

  return {
    mission: pipeline,
    pipeline,
    missionId: pipeline.id,
    pipelineId: pipeline.id,
  };
}

/**
 * Ensure a mission exists for a quick action (create when missing).
 *
 * @param {Object} params
 * @param {string | null | undefined} [params.missionId]
 * @param {string} params.storeId
 * @param {string} [params.actionType]
 * @param {string} [params.source]
 * @param {string} [params.intentText]
 * @param {string} [params.label]
 * @param {string | null} [params.userId]
 * @param {string | null} [params.sessionId]
 * @param {string | null} [params.tenantId]
 * @param {string | null} [params.storeName]
 */
export async function ensureQuickActionMission(params) {
  const existing = str(params.missionId);
  if (existing) {
    return { missionId: existing, pipelineId: existing, created: false };
  }
  if (!isQuickActionMissionCreationEnabled()) {
    return { missionId: null, pipelineId: null, created: false };
  }

  const { getPrismaClient } = await import('../prisma.js');
  const result = await createMissionFromQuickAction({
    ...params,
    prisma: getPrismaClient(),
  });

  return {
    missionId: result.missionId,
    pipelineId: result.pipelineId,
    created: true,
    mission: result.mission,
  };
}

export default {
  createMissionFromQuickAction,
  ensureQuickActionMission,
  generateQuickActionPlan,
  getStepsForActionType,
  mapActionTypeToMissionType,
  isQuickActionMissionCreationEnabled,
};
