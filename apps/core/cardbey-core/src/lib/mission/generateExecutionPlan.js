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
} from '../kernel/missionContract.js';
import { claimMissionSpineOwnership, SPINE_OWNERS } from '../kernel/spineAuthority.js';
import { withCanonicalRuntimeState } from '../runtime/canonicalRuntimeState.js';

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

  let missionId = typeof options.missionId === 'string' ? options.missionId.trim() : '';

  if (!missionId) {
    const titleSeed = intentText.slice(0, 80) || 'Multi-agent plan';
    const pipeline = await createMissionPipeline({
      type: missionType,
      title: (options.title || `Plan: ${titleSeed}`).slice(0, 180),
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
    });
    missionId = pipeline.id;
  }

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
    await freezeMissionContract(missionId, {
      tool,
      missionType,
      missionId,
      userGoalSnapshot: intentText,
      evidenceId: params.evidenceId ?? options.intakeEvidence?.evidenceId ?? null,
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

  return withCanonicalRuntimeState({
    missionId,
    artifactBundle: compileResult.artifactBundle,
    validation: compileResult.validation,
    metadata,
    response: buildCompilerIntakeResponse(missionId, compileResult.artifactBundle, metadata),
  });
}

/**
 * Response shape consumable by TopologyReviewCard / intake (Phase 2 wiring).
 *
 * @param {string} missionId
 * @param {import('../artifact/types.ts').ArtifactBundle} artifactBundle
 * @param {Record<string, unknown>} metadata
 */
export function buildCompilerIntakeResponse(missionId, artifactBundle, metadata) {
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
      nodeCount: artifactBundle.topology.nodes.length,
      estimatedMinutes: artifactBundle.reasoning.timeline?.estimatedMinutes ?? null,
      qualityScore: artifactBundle.reasoning.metadata?.qualityScore ?? null,
    },
  });
}

/**
 * @param {string} missionId
 */
export async function getExecutionPlanMetadata(missionId) {
  return readMetadata(missionId);
}
