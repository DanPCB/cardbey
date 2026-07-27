/**
 * Phase 2 — conflict detection and re-planning handoff for the reasoning loop.
 */

import {
  appendReasoningTrace,
  recordGraphDecision,
  setGraphPhase,
} from '../evidence/missionEvidenceGraphService.js';
import { recordEvidenceConflict } from '../mission/missionEvidenceGraph.js';

/**
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 */
export function hasUnresolvedConflicts(graph) {
  return (graph.conflicts ?? []).some((c) => c.resolved !== true);
}

/**
 * Re-open model phase when conflicts or re-analysis flag require replanning.
 *
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 * @param {{ force?: boolean; source?: string }} [options]
 */
export function triggerReasoningReplan(graph, options = {}) {
  const unresolved = (graph.conflicts ?? []).filter((c) => c.resolved !== true);
  const shouldReplan =
    options.force === true || graph.reanalysisRequired === true || unresolved.length > 0;

  if (!shouldReplan) return { replanned: false };

  if (unresolved.length === 0 && graph.reanalysisRequired) {
    recordEvidenceConflict(graph, {
      code: 'REANALYSIS_REQUIRED',
      type: 'reanalysis_pending',
      message: 'Re-analysis confirmed — replanning from evidence graph',
      resolved: false,
    });
  }

  recordGraphDecision(graph, {
    type: 'replan_triggered',
    question: 'Should the reasoning loop replan from updated evidence?',
    answer: 'yes',
    rationale: options.source ?? 'reasoningConflictHandler.triggerReasoningReplan',
    confidence: 1,
    source: 'reasoningConflictHandler',
  });

  appendReasoningTrace(graph, 'Re-plan triggered — refreshing model from graph evidence', {
    conflictCount: unresolved.length,
    reanalysisRequired: graph.reanalysisRequired === true,
  });

  setGraphPhase(graph, 'model');
  return { replanned: true, conflictCount: unresolved.length };
}
