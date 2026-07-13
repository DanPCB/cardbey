/**
 * Phase 1 — graph conflict detection and re-analysis prompts.
 */

import { randomUUID } from 'node:crypto';
import { Features } from '../../config/features.js';
import {
  appendPerception,
  loadGraphByMission,
  persistGraph,
  recordGraphDecision,
} from './missionEvidenceGraphService.js';
import { recordEvidenceConflict } from '../mission/missionEvidenceGraph.js';
import { readMetadata } from '../persistence/metadataWriter.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {import('./missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown> | null} [metadata]
 */
export function isContractFrozen(graph, metadata = null) {
  if (graph.frozenSnapshotId) return true;
  if (graph.phase === 'terminal') return true;
  const contract = metadata?.missionContract;
  if (contract && typeof contract === 'object' && contract.frozenAt) return true;
  return false;
}

/**
 * @param {import('./missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 */
export function triggerReanalysisPrompt(graph) {
  graph.reanalysisRequired = true;
  recordGraphDecision(graph, {
    type: 'reanalysis_required',
    question: 'Should impact analysis re-run on new evidence?',
    answer: 'pending',
    rationale: 'New evidence arrived after contract freeze or terminal phase.',
    confidence: 1,
    source: 'graphConflictService.triggerReanalysisPrompt',
  });
  return {
    action: 'reanalysis_prompt',
    graphId: graph.graphId,
    graphVersion: graph.version,
    message: 'New evidence detected after freeze. Re-run analysis?',
    options: ['yes', 'later', 'never'],
  };
}

/**
 * Handle new attachment/evidence after graph freeze.
 *
 * @param {string} missionId
 * @param {Record<string, unknown>} newAttachment
 */
export async function handleNewEvidence(missionId, newAttachment = {}) {
  if (!Features.phase1.graphConflictDetection) return null;

  const mid = pickString(missionId);
  if (!mid) return null;

  const metadata = await readMetadata(mid);
  let graph = await loadGraphByMission(mid);
  if (!graph) return null;

  const frozen = isContractFrozen(graph, metadata);
  let prompt = null;

  if (frozen) {
    const conflict = {
      code: 'NEW_EVIDENCE_POST_FREEZE',
      message: 'New evidence uploaded after contract/graph freeze',
      resolved: false,
      type: 'new_evidence_post_freeze',
      field: 'attachments',
      existingVersion: graph.version,
      newData: {
        attachmentId: newAttachment.attachmentId ?? newAttachment.id ?? null,
        evidenceId: newAttachment.evidenceId ?? null,
      },
    };
    recordEvidenceConflict(graph, conflict);
    prompt = triggerReanalysisPrompt(graph);
  }

  appendPerception(graph, {
    id: `per_new_${randomUUID().slice(0, 8)}`,
    type: frozen ? 'new_attachment_post_freeze' : 'new_attachment',
    source: 'graphConflictService',
    confidence: 1,
    data: {
      attachmentId: newAttachment.attachmentId ?? newAttachment.id ?? null,
      evidenceId: newAttachment.evidenceId ?? null,
      contentHash: newAttachment.contentHash ?? null,
    },
  });

  await persistGraph(graph, { missionId: mid });
  return { graph, prompt, frozen };
}

/**
 * @param {string} missionId
 */
export async function getGraphIntegrityStatus(missionId) {
  const graph = await loadGraphByMission(missionId);
  if (!graph) return { status: 'MISSING', missionId };

  const unresolved = (graph.conflicts ?? []).filter((c) => c.resolved !== true);
  return {
    status: unresolved.length ? 'INVALID' : 'VALID',
    missionId,
    graphId: graph.graphId,
    version: graph.version,
    conflictCount: unresolved.length,
    reanalysisRequired: graph.reanalysisRequired === true,
    phase: graph.phase,
  };
}
