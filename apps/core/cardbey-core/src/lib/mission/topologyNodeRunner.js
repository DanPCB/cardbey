/**
 * topologyNodeRunner — execute approved topology nodes in dependency order (Phase 4).
 */

import { getExecutor } from '../toolExecutors/index.js';
import { writeMetadata } from '../persistence/metadataWriter.js';
import { buildCampaignNodeInput } from './topologyCampaignInputs.js';
import {
  recordTopologyNodeEvent,
  resolveTopologyNodeLabel,
  normalizeTopologyError,
  emitTopologyBlackboardEvent,
  emitTopologyReasoningLine,
  appendExecutionTimeline,
} from './topologyExecutionTelemetry.js';
import {
  attachmentAnalysisAsEvidence,
  buildExecutionDraft,
  assertNoStaleMissingFields,
  computeMissingFields,
} from './topologyExecutionDraft.js';
import {
  normalizeCampaignPackageArtifact,
  synthesizeCampaignPackageFromToolOutputs,
} from './campaignPackageArtifact.js';

/** Tools that may soft-fail without blocking downstream packaging. */
const SOFT_FAIL_TOOLS = new Set(['generate_slideshow', 'generate_poster']);

/** Keys merged from prior toolOutputs into loyalty node input. */
const LOYALTY_PRIOR_KEYS = [
  'storeId',
  'objective',
  'preseededDraft',
  'attachmentAnalysis',
  'storeContext',
  'loyaltyRequirements',
  'loyaltyDraft',
  'loyaltyProgramDraft',
  'ownerInput',
  'executionDraft',
  'loyaltyRequirements',
];

/**
 * Normalize missing field ids from a needs_input tool result.
 * Accepts string[] or { id, label }[].
 * @param {unknown} result
 * @returns {string[]}
 */
export function extractMissingFields(result) {
  if (!result || typeof result !== 'object') return [];
  const rec = /** @type {Record<string, unknown>} */ (result);
  const raw = rec.missingFields ?? rec.output?.missingFields;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => {
      if (typeof f === 'string') return f.trim();
      if (f && typeof f === 'object' && typeof /** @type {{ id?: unknown }} */ (f).id === 'string') {
        return String(/** @type {{ id: string }} */ (f).id).trim();
      }
      return '';
    })
    .filter(Boolean);
}

/**
 * @param {Record<string, unknown>} toolOutputs
 * @returns {Record<string, unknown>}
 */
function mergeLoyaltyPriorsFromToolOutputs(toolOutputs) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (!toolOutputs || typeof toolOutputs !== 'object') return out;
  for (const value of Object.values(toolOutputs)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const rec = /** @type {Record<string, unknown>} */ (value);
    for (const key of LOYALTY_PRIOR_KEYS) {
      if (rec[key] != null && out[key] == null) out[key] = rec[key];
    }
  }
  return out;
}

/**
 * @param {import('../artifact/types.ts').TopologyNode | Record<string, unknown>} node
 * @returns {string[]}
 */
export function getNodeDependencies(node) {
  if (Array.isArray(node?.dependsOn)) {
    return node.dependsOn.map((d) => String(d).trim()).filter(Boolean);
  }
  const config = node?.config;
  if (config && typeof config === 'object' && Array.isArray(config.dependsOn)) {
    return config.dependsOn.map((d) => String(d).trim()).filter(Boolean);
  }
  return [];
}

/**
 * @param {Array<import('../artifact/types.ts').TopologyNode | Record<string, unknown>>} nodes
 * @param {Record<string, string>} nodeStatus
 * @returns {string[]}
 */
export function getRunnableNodeIds(nodes, nodeStatus) {
  if (!Array.isArray(nodes)) return [];

  return nodes
    .filter((node) => {
      const id = String(node?.id ?? '').trim();
      if (!id || nodeStatus[id] !== 'pending') return false;
      const deps = getNodeDependencies(node);
      return deps.every((dep) => nodeStatus[dep] === 'completed' || nodeStatus[dep] === 'skipped');
    })
    .map((node) => String(node.id).trim());
}

/**
 * @param {Array<import('../artifact/types.ts').TopologyNode | Record<string, unknown>>} nodes
 * @returns {Record<string, 'pending'>}
 */
export function initializeNodeStatus(nodes) {
  /** @type {Record<string, 'pending'>} */
  const status = {};
  for (const node of nodes) {
    const id = String(node?.id ?? '').trim();
    if (id) status[id] = 'pending';
  }
  return status;
}

/**
 * @param {string} toolName
 * @param {import('../artifact/types.ts').TopologyNode | Record<string, unknown>} node
 * @param {Record<string, unknown>} executionContext
 * @param {Record<string, unknown>} toolOutputs
 */
export function buildNodeInput(toolName, node, executionContext, toolOutputs) {
  const mode = String(executionContext.executionMode ?? 'generic').trim();
  if (mode === 'campaign') {
    return buildCampaignNodeInput(node, {
      storeId: executionContext.storeId,
      goal: executionContext.goal,
      toolOutputs,
    });
  }
  if (mode === 'loyalty') {
    const priors = mergeLoyaltyPriorsFromToolOutputs(toolOutputs);
    const ownerInput =
      (executionContext.ownerInput && typeof executionContext.ownerInput === 'object'
        ? executionContext.ownerInput
        : null) ||
      (priors.ownerInput && typeof priors.ownerInput === 'object' ? priors.ownerInput : null);
    const attachmentRaw =
      executionContext.attachmentAnalysisEvidence ??
      priors.attachmentAnalysis ??
      executionContext.attachmentAnalysis ??
      null;
    const attachmentEvidence = attachmentAnalysisAsEvidence(attachmentRaw);
    const loyaltyRequirements = priors.loyaltyRequirements ?? null;
    const executionDraft =
      (executionContext.executionDraft && typeof executionContext.executionDraft === 'object'
        ? executionContext.executionDraft
        : null) ||
      buildExecutionDraft({
        attachmentAnalysis: attachmentRaw,
        preseededDraft:
          executionContext.preseededDraft ??
          priors.preseededDraft ??
          attachmentRaw?.preseededDraft,
        ownerInput,
        loyaltyRequirements,
        runtimeUpdates: priors.loyaltyDraft ?? null,
      });
    const objective =
      (typeof executionContext.goal === 'string' && executionContext.goal.trim()) ||
      (typeof priors.objective === 'string' && priors.objective.trim()) ||
      '';
    return {
      storeId: executionContext.storeId ?? priors.storeId ?? null,
      ...(objective ? { objective } : {}),
      executionDraft,
      preseededDraft: executionDraft,
      ...(ownerInput ? { ownerInput } : {}),
      ...(attachmentEvidence != null ? { attachmentAnalysis: attachmentEvidence } : {}),
      ...(priors.storeContext != null ? { storeContext: priors.storeContext } : {}),
      ...(loyaltyRequirements != null ? { loyaltyRequirements } : {}),
      ...(priors.loyaltyDraft != null ? { loyaltyDraft: priors.loyaltyDraft } : {}),
      ...(priors.loyaltyProgramDraft != null
        ? { loyaltyProgramDraft: priors.loyaltyProgramDraft }
        : {}),
      source: executionContext.source ?? 'topology_executor_loyalty',
      toolName,
    };
  }
  return {
    storeId: executionContext.storeId ?? null,
    ...(executionContext.goal ? { objective: executionContext.goal } : {}),
  };
}

/**
 * Extract validation errors from a tool result (if any).
 * @param {unknown} result
 * @returns {unknown[] | null}
 */
export function extractValidationErrors(result) {
  if (!result || typeof result !== 'object') return null;
  const rec = /** @type {Record<string, unknown>} */ (result);
  const validation = rec.validation && typeof rec.validation === 'object' ? rec.validation : null;
  const candidates = [
    rec.validationErrors,
    rec.errors,
    validation && /** @type {Record<string, unknown>} */ (validation).errors,
  ].filter(Boolean);
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c;
  }
  const err = rec.error;
  if (err && typeof err === 'object') {
    const e = /** @type {Record<string, unknown>} */ (err);
    if (Array.isArray(e.validationErrors) && e.validationErrors.length) return e.validationErrors;
    if (Array.isArray(e.details) && e.details.length) return e.details;
  }
  return null;
}

/**
 * @param {import('../artifact/types.ts').TopologyNode | Record<string, unknown>} node
 * @param {Record<string, unknown>} input
 * @param {Record<string, unknown>} executionContext
 */
export async function dispatchTopologyNode(node, input, executionContext) {
  const toolName = String(node?.toolName ?? '').trim();
  const nodeId = String(node?.id ?? '').trim() || null;
  const label = resolveTopologyNodeLabel(node, toolName);
  const mid = String(executionContext.missionId ?? '').trim() || null;

  if (!toolName) {
    const failed = {
      status: 'failed',
      error: { code: 'MISSING_TOOL', message: 'Topology node is missing toolName' },
    };
    if (mid) {
      await recordTopologyNodeEvent({
        missionId: mid,
        phase: 'validation_errors',
        nodeId,
        toolName,
        label,
        validationErrors: [failed.error],
        status: 'failed',
      });
    }
    return failed;
  }

  const executor = getExecutor(toolName);
  if (!executor || typeof executor.execute !== 'function') {
    const failed = {
      status: 'failed',
      error: { code: 'NO_EXECUTOR', message: `No executor registered for ${toolName}` },
    };
    if (mid) {
      await recordTopologyNodeEvent({
        missionId: mid,
        phase: 'validation_errors',
        nodeId,
        toolName,
        label,
        validationErrors: [failed.error],
        status: 'failed',
      });
    }
    return failed;
  }

  const context = {
    missionId: executionContext.missionId,
    storeId: executionContext.storeId ?? undefined,
    userId: executionContext.userId ?? undefined,
    tenantId: executionContext.tenantId ?? undefined,
    goal: executionContext.goal ?? undefined,
    ownerInput: executionContext.ownerInput ?? undefined,
    preseededDraft: executionContext.executionDraft ?? executionContext.preseededDraft ?? undefined,
    executionDraft: executionContext.executionDraft ?? undefined,
    attachmentAnalysis:
      executionContext.attachmentAnalysisEvidence ?? executionContext.attachmentAnalysis ?? undefined,
    runtimeOwned: true,
    performerRuntimeOwned: true,
    source: 'topology_executor',
    stepOutputs: executionContext.toolOutputs ?? {},
  };

  if (mid) {
    await recordTopologyNodeEvent({
      missionId: mid,
      phase: 'tool_invoked',
      nodeId,
      toolName,
      label,
      status: 'running',
    });
    await recordTopologyNodeEvent({
      missionId: mid,
      phase: 'tool_input',
      nodeId,
      toolName,
      label,
      input,
      status: 'running',
    });
  }

  try {
    const result = await executor.execute(input, context);
    if (mid) {
      await recordTopologyNodeEvent({
        missionId: mid,
        phase: 'tool_output',
        nodeId,
        toolName,
        label,
        output: result,
        status: String(result?.status ?? 'unknown'),
      });
      const validationErrors = extractValidationErrors(result);
      if (validationErrors?.length) {
        await recordTopologyNodeEvent({
          missionId: mid,
          phase: 'validation_errors',
          nodeId,
          toolName,
          label,
          validationErrors,
          status: String(result?.status ?? 'failed'),
        });
      }
    }
    return result;
  } catch (err) {
    if (mid) {
      await recordTopologyNodeEvent({
        missionId: mid,
        phase: 'exception',
        nodeId,
        toolName,
        label,
        exception: err,
        status: 'failed',
      });
    }
    return {
      status: 'failed',
      error: {
        code: 'EXECUTOR_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * @param {unknown} result
 * @returns {Record<string, unknown> | null}
 */
function extractToolOutput(result) {
  if (!result || typeof result !== 'object') return null;
  const output = /** @type {Record<string, unknown>} */ (result).output;
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return output;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} toolOutputs
 * @returns {Record<string, unknown>}
 */
export function aggregateTopologyOutputs(toolOutputs) {
  const artifactOut = toolOutputs.package_campaign_artifact;
  const artifact =
    (artifactOut && typeof artifactOut === 'object' && artifactOut.artifact
      ? normalizeCampaignPackageArtifact(artifactOut.artifact)
      : null) ?? synthesizeCampaignPackageFromToolOutputs(toolOutputs);

  const presentReview = toolOutputs['loyalty.present_review'];
  const loyaltyPresent =
    presentReview && typeof presentReview === 'object' ? presentReview : null;
  const loyaltyArtifact =
    (loyaltyPresent?.artifact && typeof loyaltyPresent.artifact === 'object'
      ? loyaltyPresent.artifact
      : null) ||
    (Array.isArray(loyaltyPresent?.artifacts) && loyaltyPresent.artifacts[0]
      ? loyaltyPresent.artifacts[0]
      : null);

  return {
    topologyToolOutputs: { ...toolOutputs },
    ...(artifact
      ? {
          campaignArtifact: artifact,
          campaignPackage: artifact,
          artifacts: [artifact],
        }
      : {}),
    ...(loyaltyArtifact
      ? {
          loyaltyProgramDraftArtifact: loyaltyArtifact,
          loyaltyProgramDraft: loyaltyPresent?.loyaltyProgramDraft ?? loyaltyArtifact.data ?? null,
          artifacts: [loyaltyArtifact],
          phase: 'awaiting_owner_review',
          message: 'Loyalty program draft created.',
        }
      : {}),
  };
}

/**
 * @param {unknown} result
 * @returns {string | null}
 */
function extractSuggestedQuestion(result) {
  if (!result || typeof result !== 'object') return null;
  const rec = /** @type {Record<string, unknown>} */ (result);
  const fromTop =
    (typeof rec.suggestedQuestion === 'string' && rec.suggestedQuestion.trim()) ||
    (typeof rec.message === 'string' && rec.message.trim()) ||
    null;
  if (fromTop) return fromTop;
  const output = rec.output && typeof rec.output === 'object' ? /** @type {Record<string, unknown>} */ (rec.output) : null;
  if (output && typeof output.suggestedQuestion === 'string' && output.suggestedQuestion.trim()) {
    return output.suggestedQuestion.trim();
  }
  return null;
}

/**
 * Execute all topology nodes respecting dependsOn edges.
 *
 * @param {string} missionId
 * @param {import('../artifact/types.ts').TopologyArtifact | Record<string, unknown>} topology
 * @param {Record<string, unknown>} executionContext
 * @param {{
 *   resumeFrom?: string | null;
 *   priorNodeStatus?: Record<string, string> | null;
 *   priorNodeOutputs?: Record<string, unknown> | null;
 *   priorToolOutputs?: Record<string, unknown> | null;
 * }} [opts]
 */
export async function runTopologyNodes(missionId, topology, executionContext = {}, opts = {}) {
  const mid = String(missionId ?? '').trim();
  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : [];
  if (!mid || !nodes.length) {
    throw new Error('runTopologyNodes requires missionId and topology.nodes');
  }

  const resumeFrom =
    typeof opts.resumeFrom === 'string' && opts.resumeFrom.trim() ? opts.resumeFrom.trim() : null;
  const isResume = Boolean(resumeFrom);

  const nodeById = new Map(nodes.map((node) => [String(node.id).trim(), node]));
  /** @type {Record<string, string>} */
  const nodeStatus = isResume && opts.priorNodeStatus && typeof opts.priorNodeStatus === 'object'
    ? { ...initializeNodeStatus(nodes), ...opts.priorNodeStatus }
    : initializeNodeStatus(nodes);
  /** @type {Record<string, unknown>} */
  const nodeOutputs =
    isResume && opts.priorNodeOutputs && typeof opts.priorNodeOutputs === 'object'
      ? { ...opts.priorNodeOutputs }
      : {};
  /** @type {Record<string, unknown>} */
  const toolOutputs =
    isResume && opts.priorToolOutputs && typeof opts.priorToolOutputs === 'object'
      ? { ...opts.priorToolOutputs }
      : {};

  if (isResume && resumeFrom) {
    // Keep completed/skipped outputs; re-open the paused node for another attempt.
    nodeStatus[resumeFrom] = 'pending';
    delete nodeOutputs[resumeFrom];
    const resumeNode = nodeById.get(resumeFrom);
    const resumeTool = String(resumeNode?.toolName ?? '').trim();
    if (resumeTool) delete toolOutputs[resumeTool];

    await writeMetadata(mid, {
      executionState: 'running',
      multiAgentStatus: 'executing',
      awaitingOwnerInput: false,
      pendingNodeId: resumeFrom,
      topologyNodeStatus: { ...nodeStatus },
      topologyNodeOutputs: { ...nodeOutputs },
      topologyToolOutputs: { ...toolOutputs },
      currentTopologyNodeId: resumeFrom,
    });

    await emitTopologyBlackboardEvent(mid, 'topology.resumed', {
      resumeFrom,
      executionMode: executionContext.executionMode ?? null,
    });
    emitTopologyReasoningLine(mid, `↻ Resuming topology from ${resumeFrom}`);
    await appendExecutionTimeline(mid, {
      phase: 'topology_resumed',
      nodeId: resumeFrom,
      status: 'running',
    });
  } else {
    await writeMetadata(mid, {
      executionState: 'running',
      topologyNodeStatus: { ...nodeStatus },
      topologyNodeOutputs: {},
      executionTimeline: [],
      awaitingOwnerInput: false,
      pendingNodeId: null,
      completedNodes: [],
      executionCursor: null,
      ownerInputRequirements: null,
      suggestedQuestion: null,
    });

    await emitTopologyBlackboardEvent(mid, 'topology.execution.started', {
      nodeCount: nodes.length,
      executionMode: executionContext.executionMode ?? null,
    });
    emitTopologyReasoningLine(mid, `Starting topology execution (${nodes.length} steps)`);
    await appendExecutionTimeline(mid, {
      phase: 'execution_started',
      nodeCount: nodes.length,
      status: 'running',
    });
  }

  /** @type {string[]} */
  let failedNodeIds = [];
  let pausedForOwnerInput = false;
  /** @type {string | null} */
  let pausedNodeId = null;
  /** @type {string[]} */
  let lastMissingFields = [];
  /** @type {string | null} */
  let lastSuggestedQuestion = null;

  while (true) {
    const runnableIds = getRunnableNodeIds(nodes, nodeStatus);
    const pendingCount = Object.values(nodeStatus).filter((s) => s === 'pending').length;

    if (!runnableIds.length) {
      if (pendingCount > 0 && !pausedForOwnerInput) {
        for (const [nodeId, status] of Object.entries(nodeStatus)) {
          if (status === 'pending') {
            nodeStatus[nodeId] = 'failed';
            failedNodeIds.push(nodeId);
            const node = nodeById.get(nodeId);
            const label = resolveTopologyNodeLabel(node, node?.toolName);
            nodeOutputs[nodeId] = {
              error: {
                code: 'DEADLOCK',
                message: 'Step could not run — unmet dependencies or prior failure',
              },
            };
            await recordTopologyNodeEvent({
              missionId: mid,
              phase: 'node_finished',
              nodeId,
              toolName: node?.toolName,
              label,
              error: nodeOutputs[nodeId].error,
              status: 'failed',
            });
          }
        }
      }
      break;
    }

    for (const nodeId of runnableIds) {
      const node = nodeById.get(nodeId);
      if (!node) {
        nodeStatus[nodeId] = 'failed';
        failedNodeIds.push(nodeId);
        continue;
      }

      const toolName = String(node.toolName ?? '').trim();
      const label = resolveTopologyNodeLabel(node, toolName);
      const resumingThisNode = isResume && resumeFrom === nodeId;
      nodeStatus[nodeId] = 'running';

      await writeMetadata(mid, {
        executionState: 'running',
        topologyNodeStatus: { ...nodeStatus },
        currentTopologyNodeId: nodeId,
      });

      if (resumingThisNode) {
        await emitTopologyBlackboardEvent(mid, 'node.resumed', {
          nodeId,
          toolName,
          label,
        });
        emitTopologyReasoningLine(mid, `↻ ${label}`);
      }

      await recordTopologyNodeEvent({
        missionId: mid,
        phase: 'node_started',
        nodeId,
        toolName,
        label,
        status: 'running',
        ...(resumingThisNode ? { message: 'resumed' } : {}),
      });

      const input = buildNodeInput(toolName, node, executionContext, toolOutputs);
      if (input.executionDraft && typeof input.executionDraft === 'object') {
        executionContext.executionDraft = input.executionDraft;
      }
      if (input.attachmentAnalysis) {
        executionContext.attachmentAnalysisEvidence = input.attachmentAnalysis;
      }

      const result = await dispatchTopologyNode(node, input, {
        ...executionContext,
        toolOutputs,
        missionId: mid,
      });
      let status = String(result?.status ?? 'failed').toLowerCase();

      if (status === 'needs_input' || status === 'awaiting_owner_input') {
        const draft =
          (input.executionDraft && typeof input.executionDraft === 'object'
            ? input.executionDraft
            : null) || executionContext.executionDraft;
        const canonicalMissing = computeMissingFields(draft);
        const handlerMissing = extractMissingFields(result);
        try {
          assertNoStaleMissingFields(draft ?? {}, handlerMissing);
        } catch (staleErr) {
          if (canonicalMissing.length === 0) {
            status = 'ok';
          } else {
            throw staleErr;
          }
        }
        if (canonicalMissing.length === 0) {
          status = 'ok';
        }
      }

      if (status === 'ok' || status === 'completed') {
        const output = extractToolOutput(result);
        nodeStatus[nodeId] = 'completed';
        if (output) {
          nodeOutputs[nodeId] = output;
          if (toolName) toolOutputs[toolName] = output;
        }
        await recordTopologyNodeEvent({
          missionId: mid,
          phase: 'node_finished',
          nodeId,
          toolName,
          label,
          output: output ?? result,
          status: 'completed',
        });
        await emitTopologyBlackboardEvent(mid, 'node.completed', {
          nodeId,
          toolName,
          label,
        });
      } else if (status === 'skipped') {
        const partial = extractToolOutput(result);
        nodeStatus[nodeId] = 'skipped';
        if (partial && toolName) toolOutputs[toolName] = partial;
        nodeOutputs[nodeId] = {
          skipped: true,
          reason: result?.reason ?? result?.error?.code ?? status,
          message: result?.message ?? result?.error?.message ?? `${toolName} skipped`,
          partial,
        };
        await recordTopologyNodeEvent({
          missionId: mid,
          phase: 'node_finished',
          nodeId,
          toolName,
          label,
          output: nodeOutputs[nodeId],
          status: 'skipped',
          message: nodeOutputs[nodeId].message,
        });
      } else if (status === 'needs_input' || status === 'awaiting_owner_input') {
        const draft =
          (input.executionDraft && typeof input.executionDraft === 'object'
            ? input.executionDraft
            : null) || executionContext.executionDraft;
        let missingFields = computeMissingFields(draft ?? {});
        if (!missingFields.length) {
          missingFields = extractMissingFields(result);
        }
        assertNoStaleMissingFields(draft ?? {}, missingFields);

        if (!missingFields.length) {
          const output = extractToolOutput(result);
          nodeStatus[nodeId] = 'completed';
          if (output) {
            nodeOutputs[nodeId] = output;
            if (toolName) toolOutputs[toolName] = output;
          }
          await recordTopologyNodeEvent({
            missionId: mid,
            phase: 'node_finished',
            nodeId,
            toolName,
            label,
            output: output ?? result,
            status: 'completed',
          });
          await emitTopologyBlackboardEvent(mid, 'node.completed', { nodeId, toolName, label });
          await writeMetadata(mid, {
            executionDraft: draft,
            preseededDraft: draft,
            topologyNodeStatus: { ...nodeStatus },
            topologyNodeOutputs: { ...nodeOutputs },
            topologyToolOutputs: { ...toolOutputs },
          });
          continue;
        }

        const suggestedQuestion = extractSuggestedQuestion(result);
        const message =
          suggestedQuestion ||
          (missingFields.length
            ? `Need owner input: ${missingFields.join(', ')}`
            : 'Need owner input');
        const output = extractToolOutput(result) ?? {};
        const ownerInputRequirements =
          (result?.ownerInputRequirements && typeof result.ownerInputRequirements === 'object'
            ? result.ownerInputRequirements
            : null) ||
          (output.ownerInputRequirements && typeof output.ownerInputRequirements === 'object'
            ? output.ownerInputRequirements
            : { missingFields });

        nodeStatus[nodeId] = 'needs_input';
        nodeOutputs[nodeId] = {
          status: 'needs_input',
          missingFields,
          message,
          suggestedQuestion,
          ...output,
        };
        if (toolName) {
          toolOutputs[toolName] = {
            ...output,
            missingFields,
            message,
            suggestedQuestion,
          };
        }

        const completedNodes = Object.entries(nodeStatus)
          .filter(([, s]) => s === 'completed' || s === 'skipped')
          .map(([id]) => id);

        await writeMetadata(mid, {
          executionState: 'awaiting_owner_input',
          multiAgentStatus: 'awaiting_owner_input',
          missingFields,
          awaitingOwnerInput: true,
          pendingNodeId: nodeId,
          completedNodes,
          executionCursor: {
            pendingNodeId: nodeId,
            completedNodes,
            executionDraft: draft,
          },
          executionDraft: draft,
          preseededDraft: draft,
          ownerInputRequirements,
          suggestedQuestion,
          topologyNodeStatus: { ...nodeStatus },
          topologyNodeOutputs: { ...nodeOutputs },
          topologyToolOutputs: { ...toolOutputs },
          currentTopologyNodeId: nodeId,
        });

        await emitTopologyBlackboardEvent(mid, 'owner_input_requested', {
          nodeId,
          toolName,
          label,
          missingFields,
          suggestedQuestion,
          pendingNodeId: nodeId,
        });

        const missingJoined = missingFields.length ? missingFields.join(', ') : 'details';
        emitTopologyReasoningLine(mid, `⚠ Need owner input: ${missingJoined}`);
        await recordTopologyNodeEvent({
          missionId: mid,
          phase: 'node_finished',
          nodeId,
          toolName,
          label,
          output: nodeOutputs[nodeId],
          status: 'needs_input',
          message,
        });

        pausedForOwnerInput = true;
        pausedNodeId = nodeId;
        lastMissingFields = missingFields;
        lastSuggestedQuestion = suggestedQuestion;
        break;
      } else if (status === 'blocked' || status === 'failed') {
        const partial = extractToolOutput(result);
        if (SOFT_FAIL_TOOLS.has(toolName)) {
          nodeStatus[nodeId] = 'skipped';
          if (partial && toolName) {
            toolOutputs[toolName] = partial;
          }
          nodeOutputs[nodeId] = {
            skipped: true,
            reason: result?.reason ?? result?.error?.code ?? status,
            message: result?.message ?? result?.error?.message ?? `${toolName} skipped`,
            partial,
          };
          await recordTopologyNodeEvent({
            missionId: mid,
            phase: 'node_finished',
            nodeId,
            toolName,
            label,
            output: nodeOutputs[nodeId],
            status: 'skipped',
            message: nodeOutputs[nodeId].message,
          });
        } else {
          nodeStatus[nodeId] = 'failed';
          failedNodeIds.push(nodeId);
          const error = result?.error ?? {
            code: status,
            message:
              (typeof result?.message === 'string' && result.message.trim()) ||
              'Step failed',
          };
          nodeOutputs[nodeId] = {
            error: normalizeTopologyError(error, node),
            partial: extractToolOutput(result),
            validationErrors: extractValidationErrors(result),
          };
          await recordTopologyNodeEvent({
            missionId: mid,
            phase: 'node_finished',
            nodeId,
            toolName,
            label,
            error: nodeOutputs[nodeId].error,
            validationErrors: nodeOutputs[nodeId].validationErrors,
            output: partial ?? undefined,
            status: 'failed',
          });
        }
      } else {
        nodeStatus[nodeId] = 'failed';
        failedNodeIds.push(nodeId);
        nodeOutputs[nodeId] = {
          error: normalizeTopologyError(
            { code: 'UNKNOWN_STATUS', message: `Unexpected status: ${status}` },
            node,
          ),
        };
        await recordTopologyNodeEvent({
          missionId: mid,
          phase: 'node_finished',
          nodeId,
          toolName,
          label,
          error: nodeOutputs[nodeId].error,
          status: 'failed',
        });
      }

      await writeMetadata(mid, {
        topologyNodeStatus: { ...nodeStatus },
        topologyNodeOutputs: { ...nodeOutputs },
        topologyToolOutputs: { ...toolOutputs },
      });
    }

    if (pausedForOwnerInput) break;
  }

  failedNodeIds = [...new Set(failedNodeIds)];
  const needsInputIds = Object.entries(nodeStatus)
    .filter(([, s]) => s === 'needs_input')
    .map(([id]) => id);
  const completedCount = Object.values(nodeStatus).filter((s) => s === 'completed').length;
  const skippedCount = Object.values(nodeStatus).filter((s) => s === 'skipped').length;
  const pendingNodeId = pausedNodeId ?? needsInputIds[0] ?? null;
  const missingFields =
    lastMissingFields.length > 0
      ? lastMissingFields
      : pendingNodeId
        ? extractMissingFields(nodeOutputs[pendingNodeId])
        : [];
  const suggestedQuestion =
    lastSuggestedQuestion ||
    (pendingNodeId && typeof nodeOutputs[pendingNodeId]?.suggestedQuestion === 'string'
      ? nodeOutputs[pendingNodeId].suggestedQuestion
      : pendingNodeId && typeof nodeOutputs[pendingNodeId]?.message === 'string'
        ? nodeOutputs[pendingNodeId].message
        : null);
  const completedNodes = Object.entries(nodeStatus)
    .filter(([, s]) => s === 'completed' || s === 'skipped')
    .map(([id]) => id);

  const finalStatus = needsInputIds.length
    ? 'awaiting_owner_input'
    : failedNodeIds.length
      ? 'failed'
      : 'completed';
  const ok = finalStatus !== 'failed';
  const aggregatedOutputs = aggregateTopologyOutputs(toolOutputs);

  await writeMetadata(mid, {
    multiAgentStatus: finalStatus,
    executionState: finalStatus,
    ...(needsInputIds.length
      ? {
          awaitingOwnerInput: true,
          missingFields,
          pendingNodeId,
          completedNodes,
          executionCursor: pendingNodeId,
          suggestedQuestion,
          ownerInputRequirements: { missingFields },
        }
      : {
          awaitingOwnerInput: false,
          pendingNodeId: null,
          executionCursor: null,
          suggestedQuestion: null,
          ownerInputRequirements: null,
        }),
    topologyNodeStatus: { ...nodeStatus },
    topologyNodeOutputs: { ...nodeOutputs },
    topologyToolOutputs: { ...toolOutputs },
    executionCompletedAt: new Date().toISOString(),
    executionSummary: {
      totalNodes: nodes.length,
      completedCount,
      skippedCount,
      failedCount: failedNodeIds.length,
      failedNodeIds,
      needsInputNodeIds: needsInputIds,
    },
    currentTopologyNodeId: pendingNodeId,
  });

  await emitTopologyBlackboardEvent(mid, 'topology.execution.finished', {
    status: finalStatus,
    completedCount,
    skippedCount,
    failedCount: failedNodeIds.length,
    failedNodeIds,
    needsInputNodeIds: needsInputIds,
    pendingNodeId,
  });
  await appendExecutionTimeline(mid, {
    phase: 'execution_finished',
    status: finalStatus,
    failedNodeIds,
    needsInputNodeIds: needsInputIds,
    pendingNodeId,
    completedCount,
    skippedCount,
  });
  if (finalStatus === 'completed') {
    emitTopologyReasoningLine(mid, '✓ Topology execution complete');
  } else if (finalStatus === 'awaiting_owner_input') {
    emitTopologyReasoningLine(mid, '⚠ Topology paused — awaiting owner input');
  } else {
    emitTopologyReasoningLine(mid, '✗ Topology execution failed');
  }

  return {
    ok,
    status: finalStatus,
    nodeStatus,
    nodeOutputs,
    toolOutputs,
    outputs: aggregatedOutputs,
    failedNodeIds: needsInputIds.length ? [] : failedNodeIds,
    completedCount,
    skippedCount,
    needsInputNodeIds: needsInputIds,
    missingFields,
    pendingNodeId,
    executionCursor: pendingNodeId,
    suggestedQuestion,
    completedNodes,
  };
}
