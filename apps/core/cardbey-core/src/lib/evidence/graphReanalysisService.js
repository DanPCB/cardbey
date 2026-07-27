/**
 * Phase 1 — HITL confirm/dismiss for post-freeze evidence re-analysis.
 */

import { Features } from '../../config/features.js';
import { readMetadata } from '../persistence/metadataWriter.js';
import {
  appendReasoningTrace,
  loadGraphByMission,
  persistGraph,
  recordGraphDecision,
} from './missionEvidenceGraphService.js';

function nowIso() {
  return new Date().toISOString();
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {import('./missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 * @param {'confirmed' | 'dismissed'} resolution
 * @param {string} [note]
 */
function resolvePostFreezeConflicts(graph, resolution, note) {
  for (const conflict of graph.conflicts ?? []) {
    if (conflict.type !== 'new_evidence_post_freeze' && conflict.code !== 'NEW_EVIDENCE_POST_FREEZE') {
      continue;
    }
    conflict.resolved = true;
    conflict.resolvedAt = nowIso();
    conflict.resolution = resolution;
    if (note) conflict.resolutionNote = note;
  }
}

/**
 * Owner confirmed re-analysis — clear prompt and reopen observe phase.
 *
 * @param {string} missionId
 * @param {{ note?: string; actorId?: string }} [options]
 */
export async function confirmEvidenceReanalysis(missionId, options = {}) {
  if (!Features.phase1.graphConflictDetection) {
    return { ok: false, error: 'GRAPH_CONFLICT_DETECTION_DISABLED' };
  }

  const mid = pickString(missionId);
  if (!mid) return { ok: false, error: 'MISSION_ID_REQUIRED' };

  const graph = await loadGraphByMission(mid);
  if (!graph) return { ok: false, error: 'GRAPH_MISSING' };

  graph.reanalysisRequired = false;
  resolvePostFreezeConflicts(graph, 'confirmed', options.note);

  recordGraphDecision(graph, {
    type: 'reanalysis_confirmed',
    question: 'Re-run analysis on new evidence?',
    answer: 'yes',
    rationale: options.note ?? 'Owner confirmed evidence re-analysis.',
    confidence: 1,
    source: 'graphReanalysisService.confirmEvidenceReanalysis',
    metadata: options.actorId ? { actorId: options.actorId } : undefined,
  });

  graph.phase = 'observe';
  appendReasoningTrace(graph, 'Re-analysis confirmed — graph reopened for observe phase', {
    actorId: options.actorId ?? null,
  });

  await persistGraph(graph, { missionId: mid });
  const metadata = await readMetadata(mid);

  let reasoningFollowUp = null;
  if (Features.phase2.activeReasoning) {
    try {
      const { runReasoningStep } = await import('../reasoning/reasoningCoordinator.js');
      reasoningFollowUp = await runReasoningStep(mid, {
        reanalysisJustConfirmed: true,
        actorId: options.actorId ?? null,
      });
    } catch (err) {
      reasoningFollowUp = {
        ok: false,
        error: err instanceof Error ? err.message : 'reasoning_follow_up_failed',
      };
    }
  }

  return {
    ok: true,
    action: 'reanalysis_confirmed',
    missionId: mid,
    graphId: graph.graphId,
    graphVersion: graph.version,
    phase: graph.phase,
    reasoningFollowUp,
    resumeHint: {
      endpoint: `/api/missions/${mid}/resume`,
      reason: 'new_evidence_reanalysis',
    },
    missionContractFrozen: Boolean(metadata?.missionContract?.frozenAt),
  };
}

/**
 * Owner dismissed re-analysis prompt — keep graph but mark conflicts handled.
 *
 * @param {string} missionId
 * @param {{ note?: string; actorId?: string; never?: boolean }} [options]
 */
export async function dismissEvidenceReanalysis(missionId, options = {}) {
  if (!Features.phase1.graphConflictDetection) {
    return { ok: false, error: 'GRAPH_CONFLICT_DETECTION_DISABLED' };
  }

  const mid = pickString(missionId);
  if (!mid) return { ok: false, error: 'MISSION_ID_REQUIRED' };

  const graph = await loadGraphByMission(mid);
  if (!graph) return { ok: false, error: 'GRAPH_MISSING' };

  graph.reanalysisRequired = false;
  resolvePostFreezeConflicts(graph, 'dismissed', options.note);

  recordGraphDecision(graph, {
    type: 'reanalysis_dismissed',
    question: 'Re-run analysis on new evidence?',
    answer: options.never ? 'never' : 'later',
    rationale: options.note ?? 'Owner dismissed re-analysis prompt.',
    confidence: 1,
    source: 'graphReanalysisService.dismissEvidenceReanalysis',
    metadata: options.actorId ? { actorId: options.actorId } : undefined,
  });

  appendReasoningTrace(graph, 'Re-analysis dismissed', {
    actorId: options.actorId ?? null,
    never: options.never === true,
  });

  await persistGraph(graph, { missionId: mid });

  return {
    ok: true,
    action: 'reanalysis_dismissed',
    missionId: mid,
    graphId: graph.graphId,
    graphVersion: graph.version,
    dismissed: options.never ? 'never' : 'later',
  };
}
