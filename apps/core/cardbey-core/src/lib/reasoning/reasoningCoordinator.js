/**
 * Phase 2 — Active reasoning loop: graph → decide → act → verify → remember.
 */

import { Features } from '../../config/features.js';
import { readMetadata, writeMetadata } from '../persistence/metadataWriter.js';
import {
  appendPerception,
  appendReasoningTrace,
  getOrCreateEvidenceGraph,
  loadGraphByMission,
  loadLoyaltyEvidenceContext,
  persistGraph,
  recordGraphDecision,
  seedMissionGraphFromLoyaltyMetadata,
  setGraphPhase,
  syncLoyaltyStageToGraph,
  graphToLegacyEvidenceView,
  mergeGraphPreseedIntoPriors,
  normalizeToUnifiedGraph,
} from '../evidence/missionEvidenceGraphService.js';
import { hasAuthoritativeLoyaltyTopology } from '../loyalty/loyaltyContractDiagnostics.js';
import {
  getCapabilityExecutor,
  selectNextCapability,
  selectRankedCapabilities,
} from './reasoningCapabilityRegistry.js';
import { triggerReasoningReplan, hasUnresolvedConflicts } from './reasoningConflictHandler.js';
import { isReasoningEnabledForMission } from './reasoningRollout.js';
import { recordReasoningStep } from './reasoningTelemetry.js';
import {
  verifyReasoningStep,
  resolveReasoningTerminalOutcome,
} from './reasoningVerification.js';
import { extractTopologyIntoGraph } from './reasoningTopologyExtraction.js';
import { executeFullCardProcessing } from './loyaltyFullCardProcessing.js';
import {
  isReasoningPrimaryEnabledForMission,
  observeAndEnrichGraph,
  isPrimaryLoopComplete,
  reasoningPrimaryMaxSteps,
} from './reasoningPrimaryExecution.js';

const TERMINAL_PRIMARY_CAPABILITIES = new Set([
  'loyalty.persist_draft',
  'loyalty.present_review',
]);

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function logReasoningStep(phase, payload = {}) {
  if (!Features.phase2.reasoningStepLog) return;
  console.info(`[ReasoningCoordinator] ${phase}`, payload);
}

function needsNewObservation(graph) {
  const attachments = graph.attachments ?? [];
  if (!attachments.length) return false;
  const perceptionDone = (graph.perceptions ?? []).some(
    (p) =>
      p.type === 'ocr' ||
      p.type === 'visual_grid' ||
      p.type === 'semantic_text' ||
      p.source === 'loyaltyVisualGridEvidence',
  );
  return !perceptionDone;
}

/**
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 */
async function updateModel(graph, ctx = {}) {
  if (graph.topology && graph.rule) return graph;

  if (!graph.topology && graph.visualGrid?.rows) {
    const extracted = await extractTopologyIntoGraph(graph, ctx);
    if (extracted.ok && extracted.topology) return graph;
  }

  const legacy = graph.topology
    ? null
    : (graph.perceptions ?? []).find((p) => p.type === 'visual_grid')?.data ?? null;

  if (!graph.topology && legacy?.rows) {
    graph.topology = {
      source: 'VISION_EXTRACTED',
      rows: legacy.rows,
      columns: legacy.columns,
      cells: legacy.cells ?? [],
      confidence: legacy.confidence ?? 0.8,
    };
    recordGraphDecision(graph, {
      type: 'topology_extraction',
      question: 'What stamp grid structure does the card use?',
      answer: `${graph.topology.rows}×${graph.topology.columns}`,
      rationale: 'ReasoningCoordinator model phase',
      confidence: Number(graph.topology.confidence) || 0.8,
      source: 'reasoningCoordinator.updateModel',
    });
  }

  if (!graph.rule && graph.topology) {
    const stamps = Number(graph.topology.rows) * Number(graph.topology.columns);
    if (stamps > 0) {
      graph.rule = {
        programType: 'STAMP_CARD',
        purchasesRequired: stamps,
        purchaseItem: 'Purchase',
        rewardItem: 'Reward',
        rewardQuantity: 1,
        repeatMode: 'INDEFINITE',
      };
      recordGraphDecision(graph, {
        type: 'rule_inference',
        question: 'What loyalty rule fits the topology?',
        answer: `STAMP_CARD ${stamps} stamps`,
        rationale: 'Inferred from grid dimensions during model phase',
        confidence: 0.7,
        source: 'reasoningCoordinator.updateModel',
      });
    }
  }

  appendReasoningTrace(graph, 'Model updated from graph perceptions', {
    hasTopology: Boolean(graph.topology),
    hasRule: Boolean(graph.rule),
  });

  return graph;
}

/**
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} ctx
 */
async function triggerObservation(graph, ctx = {}) {
  logReasoningStep('observe', {
    missionId: graph.missionId,
    attachments: graph.attachments ?? [],
    perceptions: (graph.perceptions ?? []).map((p) => p.type),
  });
  appendPerception(graph, {
    type: 'reasoning_observe',
    source: 'reasoningCoordinator',
    confidence: 1,
    data: {
      missionId: graph.missionId,
      evidenceId: graph.evidenceId ?? null,
      trigger: 'needsNewObservation',
    },
  });
  appendReasoningTrace(graph, 'Observation triggered — awaiting attachment analysis', {
    phase: graph.phase,
  });
  graph.phase = 'observe';
  return {
    status: 'observing',
    action: 'observe',
    graph,
    message: 'Observation recorded; run analyze_attachment via topology or next step',
    context: ctx,
  };
}

/**
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} ctx
 */
async function generateNextPlan(graph, ctx = {}) {
  const metadata = ctx.metadata ?? (await readMetadata(graph.missionId));
  const ranked = selectRankedCapabilities(graph, {
    ...ctx,
    metadata,
    approvedTopology: metadata?.approvedTopology ?? metadata?.pendingTopology ?? null,
  });
  const capability = ranked[0] ?? null;

  if (!capability) {
    return {
      capabilityId: null,
      ranked: [],
      rationale: 'No eligible capability for current graph state',
      deferTopology: graph.phase === 'plan' || graph.phase === 'act',
    };
  }

  if (capability.id === 'loyalty.run_topology_plan') {
    return {
      capabilityId: capability.id,
      ranked: ranked.map((c) => c.id),
      rationale: 'Approved topology snapshot ready for DAG execution',
      deferTopology: true,
      topology: metadata?.approvedTopology ?? metadata?.pendingTopology ?? null,
    };
  }

  if (capability.id === 'loyalty.replan_from_conflicts') {
    return {
      capabilityId: capability.id,
      ranked: ranked.map((c) => c.id),
      virtual: true,
      rationale: 'Unresolved conflicts or re-analysis flag — replan from graph',
      replan: true,
    };
  }

  return {
    capabilityId: capability.id,
    ranked: ranked.map((c) => c.id),
    virtual: capability.virtual === true,
    rationale: `Selected ${capability.id} (priority ${capability.priority})`,
    deferTopology: false,
  };
}

const TOPOLOGY_MUTATING_CAPABILITIES = new Set([
  'loyalty.full_card_processing',
  'loyalty.extract_topology',
  'loyalty.analyze_attachment',
]);

/**
 * Prefer in-memory graph during coordinator execution — DB may lag until persistGraph.
 *
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 */
async function resolveLegacyEvidenceContext(graph) {
  const memoryView = graphToLegacyEvidenceView(normalizeToUnifiedGraph(graph));
  const persistedView = await loadLoyaltyEvidenceContext(graph.missionId);
  if (!memoryView && !persistedView) return null;
  if (!persistedView) return memoryView;
  if (!memoryView) return persistedView;
  return {
    ...persistedView,
    graph: normalizeToUnifiedGraph(graph),
    preseededDraft: mergeGraphPreseedIntoPriors(
      persistedView.preseededDraft,
      memoryView.preseededDraft,
    ),
    attachmentAnalysis: {
      ...(persistedView.attachmentAnalysis ?? {}),
      ...(memoryView.attachmentAnalysis ?? {}),
      preseededDraft: mergeGraphPreseedIntoPriors(
        persistedView.attachmentAnalysis?.preseededDraft,
        memoryView.attachmentAnalysis?.preseededDraft ?? memoryView.preseededDraft,
      ),
    },
  };
}

/**
 * @param {string} capabilityId
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} ctx
 */
async function executeCapability(capabilityId, graph, ctx = {}) {
  if (capabilityId === 'loyalty.replan_from_conflicts') {
    const replan = triggerReasoningReplan(graph, { force: true, source: 'executeCapability' });
    await updateModel(graph);
    return { status: 'ok', output: { replanned: replan.replanned }, virtual: true, capabilityId };
  }

  if (capabilityId === 'loyalty.full_card_processing') {
    const processing = await executeFullCardProcessing(graph, ctx);
    await updateModel(graph, ctx);
    setGraphPhase(graph, processing.ok ? 'model' : 'observe');
    if (processing.ok && hasAuthoritativeLoyaltyTopology(graph.topology)) {
      await persistGraph(normalizeToUnifiedGraph(graph), { missionId: graph.missionId });
    }
    return {
      status: processing.ok ? 'ok' : 'failed',
      output: processing,
      virtual: true,
      capabilityId,
      error: processing.ok
        ? undefined
        : { code: 'FULL_CARD_PROCESSING_FAILED', message: processing.reason ?? 'Card processing failed' },
    };
  }

  if (capabilityId === 'loyalty.extract_topology') {
    const extraction = await extractTopologyIntoGraph(graph, ctx);
    await updateModel(graph, ctx);
    setGraphPhase(graph, extraction.ok ? 'model' : 'observe');
    if (extraction.ok && hasAuthoritativeLoyaltyTopology(graph.topology)) {
      await persistGraph(normalizeToUnifiedGraph(graph), { missionId: graph.missionId });
    }
    return {
      status: extraction.ok ? 'ok' : 'failed',
      output: extraction,
      virtual: true,
      capabilityId,
      error: extraction.ok
        ? undefined
        : { code: 'TOPOLOGY_EXTRACTION_FAILED', message: extraction.reason ?? 'No topology candidate' },
    };
  }

  if (capabilityId === 'loyalty.run_topology_plan') {
    setGraphPhase(graph, 'act');
    return {
      status: 'ok',
      output: { deferTopology: true },
      virtual: true,
      capabilityId,
    };
  }

  const executor = getCapabilityExecutor(capabilityId);
  if (!executor?.execute) {
    return {
      status: 'skipped',
      capabilityId,
      error: { code: 'NO_EXECUTOR', message: `No executor for ${capabilityId}` },
    };
  }

  const legacyCtx = await resolveLegacyEvidenceContext(graph);
  const meta = ctx.metadata ?? {};
  const priors = ctx.stepOutputs ?? meta.topologyToolOutputs ?? {};
  const liveGraph = normalizeToUnifiedGraph(graph);

  const input = {
    ...(legacyCtx?.preseededDraft ?? {}),
    storeId: ctx.storeId ?? meta.storeId ?? null,
    missionId: graph.missionId,
    loyaltyDraft: meta.loyaltyDraft ?? meta.loyaltyProgramDraft ?? null,
    loyaltyRequirements: meta.loyaltyRequirements ?? null,
    storeContext: meta.storeContext ?? null,
  };

  const result = await executor.execute(input, {
    missionId: graph.missionId,
    userId: ctx.userId ?? null,
    storeId: ctx.storeId ?? meta.storeId ?? null,
    goal: ctx.goal ?? null,
    stepOutputs: priors,
    missionEvidenceGraph: liveGraph,
    ...(legacyCtx?.attachmentAnalysis ? { attachmentAnalysis: legacyCtx.attachmentAnalysis } : {}),
    ...(legacyCtx?.preseededDraft ? { preseededDraft: legacyCtx.preseededDraft } : {}),
  });

  const enriched = { ...result, capabilityId };
  if (result?.output) {
    if (result.output.loyaltyDraft?.cardTopology) {
      graph.topology = result.output.loyaltyDraft.cardTopology;
    }
    if (result.output.loyaltyDraft?.rule) {
      graph.rule = result.output.loyaltyDraft.rule;
    }
    await syncLoyaltyStageToGraph(graph.missionId, {
      attachmentAnalysis: result.output.attachmentAnalysis ?? null,
      preseededDraft:
        result.output.loyaltyDraft ??
        result.output.loyaltyProgramDraft ??
        result.output.preseededDraft ??
        null,
      stage: capabilityId,
    });
    if (
      TOPOLOGY_MUTATING_CAPABILITIES.has(capabilityId) ||
      hasAuthoritativeLoyaltyTopology(graph.topology)
    ) {
      await persistGraph(liveGraph, { missionId: graph.missionId });
    }
  }

  return enriched ?? { status: 'ok', output: {}, capabilityId };
}

export class ReasoningCoordinator {
  /**
   * Phase 2.5 — coordinator owns the full loop; DAG only when deferTopology.
   *
   * @param {string} mid
   * @param {Record<string, unknown>} context
   * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
   * @param {Record<string, unknown>} metadata
   * @param {{ enabled: boolean; reason?: string; rollout?: Record<string, unknown> }} rollout
   */
  async executeReasoningPrimary(mid, context, graph, metadata, rollout) {
    const replan = triggerReasoningReplan(graph, {
      force: context.reanalysisJustConfirmed === true || graph.reanalysisRequired === true,
      source: context.reanalysisJustConfirmed ? 'post_reanalysis_confirm' : 'runStep_primary',
    });
    if (replan.replanned) {
      await updateModel(graph, { metadata, ...context });
      if (context.reanalysisJustConfirmed) graph.reanalysisRequired = false;
      await persistGraph(graph, { missionId: mid });
    }

    const maxSteps = reasoningPrimaryMaxSteps();
    const chainedActions = [];
    let actionResult = { status: 'skipped', output: {} };
    let nextPlan = { capabilityId: null, ranked: [], rationale: 'primary loop not started' };
    let verification = { ok: true, skipped: true };
    let terminalOutcome = null;
    let deferTopology = false;
    let topology = null;

    appendReasoningTrace(graph, 'Reasoning-primary execution started', {
      maxSteps,
      phase: graph.phase,
    });

    for (let step = 0; step < maxSteps; step += 1) {
      metadata = (await readMetadata(mid)) ?? metadata;

      if (needsNewObservation(graph) && !hasUnresolvedConflicts(graph)) {
        logReasoningStep('primary_observe', { missionId: mid, step });
        actionResult = await observeAndEnrichGraph(graph, { metadata, ...context }, executeCapability);
        chainedActions.push({
          capabilityId: actionResult.capabilityId ?? 'observe',
          status: actionResult.status ?? null,
        });
        if (actionResult.output?.topology || graph.topology) {
          setGraphPhase(graph, 'model');
        }
      }

      if (graph.phase === 'observe' || hasUnresolvedConflicts(graph)) {
        await updateModel(graph, { metadata, ...context });
        setGraphPhase(graph, 'model');
      }

      nextPlan = await generateNextPlan(graph, { ...context, metadata });

      if (nextPlan.replan && nextPlan.capabilityId === 'loyalty.replan_from_conflicts') {
        actionResult = await executeCapability(nextPlan.capabilityId, graph, { ...context, metadata });
        chainedActions.push({ capabilityId: nextPlan.capabilityId, status: actionResult?.status ?? null });
        continue;
      }

      if (nextPlan.deferTopology && nextPlan.topology) {
        deferTopology = true;
        topology = nextPlan.topology;
        setGraphPhase(graph, 'act');
        recordGraphDecision(graph, {
          type: 'topology_plan_selected',
          question: 'How should loyalty execution proceed?',
          answer: 'run_topology_dag',
          rationale: nextPlan.rationale,
          confidence: 0.95,
          source: 'reasoningCoordinator.executeReasoningPrimary',
        });
        appendReasoningTrace(graph, 'Primary loop deferring to topology DAG snapshot', {
          capabilityId: nextPlan.capabilityId,
          ranked: nextPlan.ranked,
        });
        break;
      }

      if (!nextPlan.capabilityId) {
        setGraphPhase(graph, 'plan');
        break;
      }

      setGraphPhase(graph, nextPlan.virtual ? 'model' : 'act');
      actionResult = await executeCapability(nextPlan.capabilityId, graph, { ...context, metadata });
      chainedActions.push({
        capabilityId: nextPlan.capabilityId,
        status: actionResult?.status ?? null,
      });

      verification = await verifyReasoningStep(graph, actionResult, metadata);
      appendReasoningTrace(graph, `Primary step ${step + 1}: ${nextPlan.capabilityId}`, {
        status: actionResult?.status ?? null,
        verificationOk: verification.ok,
      });

      if (actionResult?.status === 'needs_input') {
        setGraphPhase(graph, 'verify');
        break;
      }

      terminalOutcome = resolveReasoningTerminalOutcome({
        graph,
        actionResult,
        metadata,
        capabilityId: nextPlan.capabilityId,
      });
      if (terminalOutcome) {
        graph.outcome = terminalOutcome;
        setGraphPhase(graph, 'terminal');
        break;
      }

      if (isPrimaryLoopComplete(graph, actionResult)) {
        break;
      }
    }

    if (terminalOutcome) {
      await writeMetadata(mid, {
        terminalMissionOutcome: terminalOutcome,
        missionExecutionOutcome: {
          status: terminalOutcome.status,
          rationale: terminalOutcome.rationale,
          reconciled: terminalOutcome.reconciled,
        },
      });
    }

    await persistGraph(graph, { missionId: mid });

    const completedInPrimary =
      !deferTopology &&
      (Boolean(terminalOutcome) ||
        isPrimaryLoopComplete(graph, actionResult) ||
        TERMINAL_PRIMARY_CAPABILITIES.has(actionResult?.capabilityId ?? ''));

    const result = {
      ok: true,
      graph,
      nextPlan,
      actionResult,
      chainedActions: chainedActions.length ? chainedActions : undefined,
      verification,
      terminalOutcome,
      replanned: replan.replanned,
      rollout,
      reasoningPrimary: true,
      completedInPrimary,
      deferTopology,
      topology,
    };
    recordReasoningStep(mid, result);
    return result;
  }

  /**
   * Hybrid mode — single capability per coordinator invocation (legacy Phase 2).
   */
  async executeHybrid(mid, context, graph, metadata, rollout) {
    const replan = triggerReasoningReplan(graph, {
      force: context.reanalysisJustConfirmed === true || graph.reanalysisRequired === true,
      source: context.reanalysisJustConfirmed ? 'post_reanalysis_confirm' : 'runStep',
    });
    if (replan.replanned) {
      await updateModel(graph, { metadata, ...context });
      if (context.reanalysisJustConfirmed) {
        graph.reanalysisRequired = false;
      }
      await persistGraph(graph, { missionId: mid });
    }

    if (needsNewObservation(graph) && graph.phase === 'observe' && !hasUnresolvedConflicts(graph)) {
      logReasoningStep('needs_perception', {
        missionId: mid,
        attachmentCount: graph.attachments?.length ?? 0,
      });
      await triggerObservation(graph, context);
      await persistGraph(graph, { missionId: mid });
    }

    if (graph.phase === 'observe' || hasUnresolvedConflicts(graph)) {
      await updateModel(graph, { metadata, ...context });
      setGraphPhase(graph, 'model');
      await persistGraph(graph, { missionId: mid });
    }

    let nextPlan = await generateNextPlan(graph, { ...context, metadata });

    if (nextPlan.replan && nextPlan.capabilityId === 'loyalty.replan_from_conflicts') {
      const actionResult = await executeCapability(nextPlan.capabilityId, graph, {
        ...context,
        metadata,
      });
      await persistGraph(graph, { missionId: mid });
      const result = {
        ok: true,
        graph,
        nextPlan,
        actionResult,
        replanned: true,
        verification: { ok: true, skipped: true },
        reasoningPrimary: false,
      };
      recordReasoningStep(mid, result);
      return result;
    }

    if (nextPlan.deferTopology && nextPlan.topology) {
      setGraphPhase(graph, 'act');
      recordGraphDecision(graph, {
        type: 'topology_plan_selected',
        question: 'How should loyalty execution proceed?',
        answer: 'run_topology_dag',
        rationale: nextPlan.rationale,
        confidence: 0.95,
        source: 'reasoningCoordinator.runStep',
      });
      appendReasoningTrace(graph, 'Plan: execute approved topology DAG snapshot', {
        capabilityId: nextPlan.capabilityId,
        ranked: nextPlan.ranked,
      });
      await persistGraph(graph, { missionId: mid });
      const result = {
        ok: true,
        graph,
        nextPlan,
        deferTopology: true,
        topology: nextPlan.topology,
        verification: { ok: true, skipped: true },
        replanned: replan.replanned,
        reasoningPrimary: false,
      };
      recordReasoningStep(mid, result);
      return result;
    }

    let actionResult = { status: 'skipped', output: {} };
    const chainedActions = [];
    if (nextPlan.capabilityId) {
      setGraphPhase(graph, nextPlan.virtual ? 'model' : 'act');
      actionResult = await executeCapability(nextPlan.capabilityId, graph, {
        ...context,
        metadata,
      });
      chainedActions.push({ capabilityId: nextPlan.capabilityId, status: actionResult?.status ?? null });

      const PERCEPTION_CHAIN = new Set([
        'loyalty.analyze_attachment',
        'loyalty.extract_topology',
        'loyalty.full_card_processing',
      ]);
      let chainPlan = nextPlan;
      let chainGuard = 0;
      while (
        chainGuard < 3 &&
        PERCEPTION_CHAIN.has(chainPlan.capabilityId ?? '') &&
        !graph.topology
      ) {
        chainGuard += 1;
        const followUp = await generateNextPlan(graph, { ...context, metadata });
        if (!followUp.capabilityId || followUp.capabilityId === chainPlan.capabilityId) break;
        chainPlan = followUp;
        const followUpResult = await executeCapability(followUp.capabilityId, graph, {
          ...context,
          metadata,
        });
        chainedActions.push({
          capabilityId: followUp.capabilityId,
          status: followUpResult?.status ?? null,
        });
        actionResult = followUpResult;
      }
      if (chainPlan.capabilityId && chainPlan.capabilityId !== nextPlan.capabilityId) {
        nextPlan.capabilityId = chainPlan.capabilityId;
        nextPlan.ranked = chainPlan.ranked;
      }
    } else {
      setGraphPhase(graph, 'plan');
    }

    const verification = await verifyReasoningStep(graph, actionResult, metadata);

    appendReasoningTrace(
      graph,
      nextPlan.capabilityId
        ? `Completed capability: ${nextPlan.capabilityId}`
        : 'Reasoning step: plan phase — no capability selected',
      {
        status: actionResult?.status ?? null,
        verificationOk: verification.ok,
        ranked: nextPlan.ranked,
      },
    );

    if (actionResult?.status === 'needs_input') {
      setGraphPhase(graph, 'verify');
    } else if (verification.ok) {
      setGraphPhase(graph, 'verify');
    }

    const terminalOutcome = resolveReasoningTerminalOutcome({
      graph,
      actionResult,
      metadata,
      capabilityId: nextPlan.capabilityId,
    });

    if (terminalOutcome) {
      graph.outcome = terminalOutcome;
      setGraphPhase(graph, 'terminal');
      await writeMetadata(mid, {
        terminalMissionOutcome: terminalOutcome,
        missionExecutionOutcome: {
          status: terminalOutcome.status,
          rationale: terminalOutcome.rationale,
          reconciled: terminalOutcome.reconciled,
        },
      });
    }

    await persistGraph(graph, { missionId: mid });

    const result = {
      ok: true,
      graph,
      nextPlan,
      actionResult,
      chainedActions: chainedActions.length > 1 ? chainedActions : undefined,
      verification,
      terminalOutcome: terminalOutcome ?? null,
      replanned: replan.replanned,
      rollout,
      reasoningPrimary: false,
    };
    recordReasoningStep(mid, result);
    return result;
  }

  /**
   * @param {string} missionId
   * @param {Record<string, unknown>} [context]
   */
  async runStep(missionId, context = {}) {
    const rollout = isReasoningEnabledForMission(missionId);
    if (!rollout.enabled) {
      const skipped = { ok: false, skipped: true, reason: rollout.reason, rollout };
      recordReasoningStep(missionId, skipped);
      return skipped;
    }

    const mid = pickString(missionId);
    if (!mid) {
      const failed = { ok: false, error: 'MISSION_ID_REQUIRED' };
      recordReasoningStep(mid, failed);
      return failed;
    }

    const metadata = await readMetadata(mid);
    let graph = (await loadGraphByMission(mid)) ?? (await getOrCreateEvidenceGraph(mid));
    graph.missionId = mid;

    if (!hasAuthoritativeLoyaltyTopology(graph.topology)) {
      const seeded = await seedMissionGraphFromLoyaltyMetadata(mid, {
        ...metadata,
        ...(context.metadata && typeof context.metadata === 'object' ? context.metadata : {}),
      });
      if (seeded) {
        graph = normalizeToUnifiedGraph(seeded);
        graph.missionId = mid;
      }
    }

    const primaryRollout = isReasoningPrimaryEnabledForMission(mid);
    if (primaryRollout.enabled) {
      return this.executeReasoningPrimary(mid, context, graph, metadata, {
        ...rollout,
        primary: primaryRollout,
      });
    }

    return this.executeHybrid(mid, context, graph, metadata, rollout);
  }
}

let coordinatorSingleton = null;

export function getReasoningCoordinator() {
  if (!coordinatorSingleton) {
    coordinatorSingleton = new ReasoningCoordinator();
  }
  return coordinatorSingleton;
}

export function resetReasoningCoordinatorForTests() {
  coordinatorSingleton = null;
}

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} [context]
 */
export async function runReasoningStep(missionId, context = {}) {
  return getReasoningCoordinator().runStep(missionId, context);
}
