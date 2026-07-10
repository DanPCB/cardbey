/**
 * generateExecutionPlan — compile intent and persist pending artifacts to mission metadata.
 */

import { compileWithMultiAgent } from '../agents/compileWithMultiAgent.js';
import { createMissionPipeline } from '../missionPipelineService.js';
import {
  readMetadata,
  writePendingArtifactBundle,
  writeMetadata,
} from '../persistence/metadataWriter.js';
import { ARTIFACT_COMPILER_VERSION } from '../artifact/types.ts';
import {
  freezeMissionContract,
  deriveMissionFamily,
  MissionContractAssertionError,
  readMissionContract,
} from '../kernel/missionContract.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

const TERMINAL_COMPILE_MISSION_STATUSES = new Set(['completed', 'cancelled']);

/**
 * Compiler must not remount topology into a terminal or wrong-type mission pipeline.
 * @param {string | null | undefined} proposedMissionId
 * @param {Parameters<typeof createMissionPipeline>[0]} createParams
 */
async function resolveMissionIdForExecutionPlan(proposedMissionId, createParams) {
  const trimmed = typeof proposedMissionId === 'string' ? proposedMissionId.trim() : '';
  if (!trimmed) {
    const pipeline = await createMissionPipeline(createParams);
    return pipeline.id;
  }

  const { getPrismaClient } = await import('../prisma.js');
  const prisma = getPrismaClient();
  const row = await prisma.missionPipeline.findUnique({
    where: { id: trimmed },
    select: { status: true, type: true },
  });

  const expectedType = String(createParams.type ?? '').trim();
  if (!row) {
    const pipeline = await createMissionPipeline(createParams);
    return pipeline.id;
  }

  const status = String(row.status ?? '').trim();
  const rowType = String(row.type ?? '').trim();
  const terminal = TERMINAL_COMPILE_MISSION_STATUSES.has(status);
  const typeMismatch = Boolean(expectedType && rowType && rowType !== expectedType);

  if (terminal || typeMismatch) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[generateExecutionPlan] creating fresh mission — proposed id not eligible', {
        proposedMissionId: trimmed,
        status,
        rowType,
        expectedType,
      });
    }
    const pipeline = await createMissionPipeline(createParams);
    return pipeline.id;
  }

  return trimmed;
}
import { claimMissionSpineOwnership, SPINE_OWNERS } from '../kernel/spineAuthority.js';
import { withCanonicalRuntimeState } from '../runtime/canonicalRuntimeState.js';
import {
  buildExecutionPlanAuthorizationFields,
  resolveToolAuthorization,
} from '../runtime/resolveToolAuthorization.js';

/**
 * @param {{
 *   text: string;
 *   tool?: string;
 *   missionType?: string;
 *   parameters?: Record<string, unknown>;
 * }} intent
 * @param {string | null | undefined} storeId
 * @param {string | null | undefined} sessionId
 * @param {{
 *   missionId?: string | null;
 *   userId?: string | null;
 *   tenantId?: string | null;
 *   locale?: string;
 *   title?: string;
 *   principal?: { kind: 'authenticated'; userId: string; accountId?: string } | { kind: 'anonymous'; anonymousSessionId?: string };
 * }} [options]
 */
export async function generateExecutionPlan(intent, storeId, sessionId, options = {}) {
  const intentText = String(intent?.text ?? '').trim();
  if (!intentText) {
    throw new Error('generateExecutionPlan requires intent.text');
  }

  const tool = String(intent.tool ?? 'create_campaign').trim();
  const missionType =
    intent.missionType ??
    (tool === 'create_campaign'
      ? 'launch_campaign'
      : tool === 'setup_loyalty_program' || tool === 'create_loyalty_program'
        ? 'setup_loyalty_program'
        : tool);

  const createParams = {
    type: missionType,
    title: (options.title || `Plan: ${intentText.slice(0, 80) || 'Multi-agent plan'}`).slice(0, 180),
    targetType: storeId ? 'store' : 'generic',
    targetId: storeId ?? undefined,
    metadata: {
      storeId: storeId ?? null,
      sessionId: sessionId ?? null,
      goal: intentText,
      source:
        missionType === 'setup_loyalty_program' ? 'loyalty_spine' : 'multi_agent_compiler',
      compilerTool: tool,
      compilerVersion: ARTIFACT_COMPILER_VERSION,
      locale: options.locale ?? 'en',
      ...(options.executionContext && typeof options.executionContext === 'object'
        ? {
            executionContext: options.executionContext,
            selectedStore: options.executionContext.selectedStore ?? null,
            selectedSpace: options.executionContext.selectedSpace ?? null,
            selectionMethod: options.executionContext.selectionMethod ?? null,
            selectionReason: options.executionContext.selectionReason ?? null,
            storeLocked: options.executionContext.storeLocked === true,
            brandTheme: options.executionContext.brandTheme ?? null,
          }
        : {}),
      ...(intent.parameters && typeof intent.parameters === 'object' ? { intentParameters: intent.parameters } : {}),
    },
    requiresConfirmation: true,
    executionMode: 'GUIDED_RUN',
    tenantId: options.tenantId ?? options.userId ?? 'default',
    createdBy: options.userId ?? null,
  };

  const missionId = await resolveMissionIdForExecutionPlan(options.missionId, createParams);

  await claimMissionSpineOwnership(missionId, SPINE_OWNERS.COMPILER_TOPOLOGY, {
    source: 'generate_execution_plan',
    tool,
    missionFamily: deriveMissionFamily({ tool, missionType }),
  });

  const compileResult = await compileWithMultiAgent(
    {
      text: intentText,
      tool,
      missionType,
      storeId: storeId ?? null,
      parameters: intent.parameters,
    },
    {
      missionId,
      sessionId: sessionId ?? null,
      storeId: storeId ?? null,
      userId: options.userId ?? null,
      tenantKey: options.tenantId ?? options.userId ?? 'default',
      locale: options.locale ?? 'en',
    },
  );

  const params =
    intent.parameters && typeof intent.parameters === 'object' && !Array.isArray(intent.parameters)
      ? intent.parameters
      : {};
  const preseededDraft =
    params.preseededDraft && typeof params.preseededDraft === 'object' ? params.preseededDraft : null;

  let metadata = await writePendingArtifactBundle(missionId, compileResult.artifactBundle);
  try {
    const existingContract = await readMissionContract(missionId);
    const evidenceIdForFreeze =
      pickString(existingContract?.evidenceId) ??
      pickString(params.evidenceId, options.intakeEvidence?.evidenceId);
    await freezeMissionContract(missionId, {
      tool,
      missionType,
      missionId,
      userGoalSnapshot: intentText,
      evidenceId: evidenceIdForFreeze,
      executionContext: options.executionContext ?? { storeId: storeId ?? null },
      storeId,
      userId: options.userId ?? null,
      builderId:
        compileResult?.builder ??
        (deriveMissionFamily({ tool, missionType }) === 'loyalty' ? 'loyaltyTopologyBuilder' : 'multiAgentCompiler'),
    });
  } catch (error) {
    if (error instanceof MissionContractAssertionError) {
      error.message = `[generateExecutionPlan] ${error.message}`;
    }
    throw error;
  }
  if (preseededDraft || params.source || options.executionContext || options.intakeEvidence) {
    metadata = await writeMetadata(missionId, {
      ...(preseededDraft ? { preseededDraft } : {}),
      ...(params.source ? { source: params.source } : {}),
      ...(options.executionContext && typeof options.executionContext === 'object'
        ? {
            executionContext: options.executionContext,
            selectedStore: options.executionContext.selectedStore ?? null,
            selectedSpace: options.executionContext.selectedSpace ?? null,
            selectionMethod: options.executionContext.selectionMethod ?? null,
            selectionReason: options.executionContext.selectionReason ?? null,
            storeLocked: options.executionContext.storeLocked === true,
            brandTheme: options.executionContext.brandTheme ?? null,
          }
        : {}),
      compilerTool: tool,
      intakeEvidence:
        options.intakeEvidence && typeof options.intakeEvidence === 'object' ? options.intakeEvidence : undefined,
    });
  }

  const principal =
    options.principal ??
    (options.userId
      ? { kind: 'authenticated', userId: String(options.userId).trim() }
      : { kind: 'anonymous', anonymousSessionId: 'unknown' });
  const authorization = await resolveToolAuthorization({
    principal,
    storeId,
    tool,
  });
  metadata = await writeMetadata(missionId, {
    authorization: buildExecutionPlanAuthorizationFields(authorization, {
      toolName: tool,
      missionId,
      uploadedAssetIds: Array.isArray(params.uploadedAssetIds)
        ? params.uploadedAssetIds
        : params.sourceAssetId
          ? [params.sourceAssetId]
          : [],
    }),
  });

  return withCanonicalRuntimeState({
    missionId,
    artifactBundle: compileResult.artifactBundle,
    validation: compileResult.validation,
    metadata,
    authorization,
    response: buildCompilerIntakeResponse(
      missionId,
      compileResult.artifactBundle,
      metadata,
      {
        tool,
        storeId,
        authorization,
        parameters: params,
      },
    ),
  });
}

/**
 * Response shape consumable by TopologyReviewCard / intake (Phase 2 wiring).
 *
 * @param {string} missionId
 * @param {import('../artifact/types.ts').ArtifactBundle} artifactBundle
 * @param {Record<string, unknown>} metadata
 * @param {{
 *   tool?: string;
 *   storeId?: string | null;
 *   authorization?: Awaited<ReturnType<typeof resolveToolAuthorization>>;
 *   parameters?: Record<string, unknown>;
 * }} [extras]
 */
export function buildCompilerIntakeResponse(missionId, artifactBundle, metadata, extras = {}) {
  const tool = String(extras.tool ?? metadata.compilerTool ?? 'create_campaign').trim();
  const authorization = extras.authorization ?? null;
  const params =
    extras.parameters && typeof extras.parameters === 'object' && !Array.isArray(extras.parameters)
      ? extras.parameters
      : {};
  const uploadedAssetIds = Array.isArray(params.uploadedAssetIds)
    ? params.uploadedAssetIds
    : params.sourceAssetId
      ? [params.sourceAssetId]
      : params.imageAssetId
        ? [params.imageAssetId]
        : [];

  return withCanonicalRuntimeState({
    success: true,
    action: 'show_execution_plan',
    missionId,
    executionPath: 'multi_agent_compile',
    multiAgentStatus: metadata.multiAgentStatus ?? 'pending_approval',
    executionPlan: {
      topology: artifactBundle.topology,
      policy: artifactBundle.policy,
      reasoning: artifactBundle.reasoning,
      metadata,
    },
    pendingTopology: artifactBundle.topology,
    pendingPolicy: artifactBundle.policy,
    pendingReasoning: artifactBundle.reasoning,
    response:
      artifactBundle.reasoning.summary ??
      'Execution plan compiled. Review and approve to continue.',
    plan: {
      toolName: tool,
      nodeCount: artifactBundle.topology.nodes.length,
      estimatedMinutes: artifactBundle.reasoning.timeline?.estimatedMinutes ?? null,
      qualityScore: artifactBundle.reasoning.metadata?.qualityScore ?? null,
      requiresAuthentication: true,
      requiresStore: true,
      ...(authorization
        ? buildExecutionPlanAuthorizationFields(authorization, {
            storeId: extras.storeId ?? authorization.storeId ?? null,
            missionId,
            uploadedAssetIds,
            parameters: {
              sourceAssetId: params.sourceAssetId ?? params.imageAssetId ?? null,
              sourceType: params.sourceType ?? (uploadedAssetIds.length ? 'loyalty_card_image' : undefined),
            },
          })
        : {}),
    },
    ...(authorization
      ? {
          authorization,
          authorizationState: authorization.state,
          canExecute: authorization.canExecute,
        }
      : {}),
  });
}

/**
 * @param {string} missionId
 */
export async function getExecutionPlanMetadata(missionId) {
  return readMetadata(missionId);
}
