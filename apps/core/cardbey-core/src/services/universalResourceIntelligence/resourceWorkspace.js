/**
 * Phase 3 — Resource Workspace orchestrator.
 * Shortlist / compare / rights / destination — does NOT auto-add all candidates to Suitcase.
 */

import { Features } from '../../config/features.js';
import { buildMultimodalIntent } from './multimodalIntent.js';
import { planSearchFromIntent } from './queryPlanner.js';
import { discoverFromPlan } from './discoveryEngine.js';
import { evaluateResourceRights } from './rightsIntelligence.js';
import { explainCandidate } from './candidateExplainer.js';
import { recommendCrossMediaCombination } from './crossMediaMatcher.js';
import { proposeSubstitutions, substitutionToSearchHint } from './substitutionEngine.js';
import {
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  listWorkspaces,
} from './workspaceStore.js';
import { createSearchSession, insertCandidateSnapshots } from './reuseRepository.js';
import {
  selectResourceCandidate,
  confirmAndExecuteReuse,
} from './reuseJourney.js';
import { listDestinationAdapters, isDestinationAllowed } from './destinationAdapters.js';
import {
  attachEvaluationEvent,
  summarizeEvaluation,
} from './evaluationFramework.js';
import { WORKSPACE_STATUS, DESTINATION_ADAPTER } from './types.js';

function workspaceEnabled() {
  return Boolean(
    Features.universalResourceIntelligence?.v1 &&
      Features.universalResourceIntelligence?.workspaceV1,
  );
}

function rankForWorkspace(candidates, intent) {
  return [...candidates].sort((a, b) => score(b, intent) - score(a, intent));
}

function score(r, intent) {
  let s = 0;
  if (intent.industry && r.industry === intent.industry) s += 3;
  if (intent.mediaType && String(r.mediaType).toLowerCase() === String(intent.mediaType).toLowerCase()) {
    s += 2;
  }
  if (intent.reference?.assetId && r.provenance?.assetId === intent.reference.assetId) s += 4;
  if (intent.audioForVideo && /audio|music/i.test(String(r.mediaType))) s += 2;
  if (intent.similarity && r.previewUrl) s += 1;
  if (r.sourceId?.startsWith('src_cardbey')) s += 1;
  if (r.aiMetadata?.confidence) s += Number(r.aiMetadata.confidence);
  return s;
}

/**
 * Open workspace: multimodal intent → discover → explained candidates (no suitcase dump).
 */
export async function openResourceWorkspace(prisma, input = {}) {
  if (!workspaceEnabled()) return { ok: false, error: 'uri_workspace_disabled' };

  const mm = await buildMultimodalIntent(input);
  if (!mm.ok) return mm;

  let evaluation = attachEvaluationEvent(
    { events: [] },
    { type: 'intent_started', modalities: mm.modalities },
  );

  const planRes = await planSearchFromIntent(mm.intent);
  if (!planRes.ok) return planRes;

  const discovery = await discoverFromPlan(prisma, planRes.searchPlan, mm.intent);
  const ranked = rankForWorkspace(discovery.candidates || [], mm.intent);

  const origin =
    input.origin ||
    (input.consumer === 'resource_workspace' ? 'admin_workspace' : null) ||
    (String(input.consumer || '').startsWith('business_task:') ? 'assistant' : 'assistant');

  const enriched = ranked.map((r) => {
    const rights = evaluateResourceRights(r);
    const explanation = explainCandidate(r, rights, { ...mm.intent, origin }, {
      origin,
      consumer: input.consumer,
      admin: origin === 'admin_workspace',
    });
    evaluation = attachEvaluationEvent(evaluation, {
      type: 'candidate_shown',
      resourceId: r.id,
    });
    evaluation = attachEvaluationEvent(evaluation, {
      type: 'rights_check',
      resourceId: r.id,
      correct: true,
      decision: rights.decision?.decision,
    });
    evaluation = attachEvaluationEvent(evaluation, {
      type: 'relevance',
      resourceId: r.id,
      score: Math.min(1, score(r, mm.intent) / 8),
    });
    return {
      resource: r,
      rights,
      explanation,
      contextActions: explanation.contextActions,
    };
  });

  const session = await createSearchSession(prisma, {
    userId: input.userId || null,
    utterance: mm.intent.utterance,
    intent: mm.intent,
    searchPlan: planRes.searchPlan,
    consumer: input.consumer || 'resource_workspace',
  });
  const snapshots = await insertCandidateSnapshots(prisma, session.id, enriched);
  const candidates = enriched.map((c, i) => ({
    ...c,
    candidateSnapshotId: snapshots[i]?.id || null,
    sessionId: session.id,
  }));

  const combo = recommendCrossMediaCombination(candidates, mm.intent);

  const workspace = await createWorkspace(prisma, {
    userId: input.userId || null,
    searchSessionId: session.id,
    intent: mm.intent,
    searchPlan: planRes.searchPlan,
    state: {
      shortlist: [],
      removed: [],
      groups: {},
      comparisons: [],
      selectedDestination: input.destination || null,
      incompleteReusePlan: null,
      rightsSnapshots: Object.fromEntries(
        candidates.map((c) => [c.resource.id, c.rights]),
      ),
      combination: combo.combination,
      collectionName: input.collectionName || null,
      candidates: candidates.map((c) => ({
        candidateSnapshotId: c.candidateSnapshotId,
        resourceId: c.resource.id,
        mediaType: c.resource.mediaType,
        title: c.resource.title,
        previewUrl: c.resource.previewUrl,
        explanation: c.explanation,
      })),
    },
    evaluation,
  });

  return {
    ok: true,
    workspaceId: workspace.id,
    sessionId: session.id,
    intent: mm.intent,
    searchPlan: planRes.searchPlan,
    modalities: mm.modalities,
    candidates,
    combination: combo.combination,
    destinations: listDestinationAdapters(),
    discoveryMeta: {
      downloaded: false,
      hosted: false,
      autoSuitcase: false,
      skipped: discovery.skipped,
      federation: planRes.searchPlan?.federation || null,
    },
    next: {
      shortlist: 'POST /api/resource-intelligence/workspace/shortlist',
      place: 'POST /api/resource-intelligence/workspace/place',
      resume: `GET /api/resource-intelligence/workspace/${workspace.id}`,
    },
    authority: 'universal_resource_intelligence',
  };
}

export async function resumeResourceWorkspace(prisma, workspaceId) {
  if (!workspaceEnabled()) return { ok: false, error: 'uri_workspace_disabled' };
  const ws = await getWorkspace(prisma, workspaceId);
  if (!ws) return { ok: false, error: 'workspace_not_found' };
  return {
    ok: true,
    workspace: ws,
    evaluation: summarizeEvaluation(ws.evaluationJson),
    destinations: listDestinationAdapters(),
  };
}

export async function listResourceWorkspaces(prisma, opts) {
  if (!workspaceEnabled()) return { ok: false, error: 'uri_workspace_disabled' };
  return { ok: true, workspaces: await listWorkspaces(prisma, opts) };
}

/**
 * Shortlist / remove / group / compare — never auto Suitcase.
 */
export async function mutateWorkspaceShortlist(prisma, input = {}) {
  if (!workspaceEnabled()) return { ok: false, error: 'uri_workspace_disabled' };
  const ws = await getWorkspace(prisma, input.workspaceId);
  if (!ws) return { ok: false, error: 'workspace_not_found' };

  const state = { ...ws.stateJson };
  const op = input.op || 'shortlist_add';

  if (op === 'shortlist_add') {
    const id = input.candidateSnapshotId || input.resourceId;
    if (!id) return { ok: false, error: 'candidate_required' };
    if (!state.shortlist.includes(id)) state.shortlist.push(id);
    state.removed = state.removed.filter((x) => x !== id);
  } else if (op === 'shortlist_remove' || op === 'remove_unsuitable') {
    const id = input.candidateSnapshotId || input.resourceId;
    state.shortlist = state.shortlist.filter((x) => x !== id);
    if (id && !state.removed.includes(id)) state.removed.push(id);
    let evaluation = attachEvaluationEvent(ws.evaluationJson, {
      type: 'user_rejection',
      reason: input.reason || 'unsuitable',
      resourceId: id,
    });
    await updateWorkspace(prisma, ws.id, { stateJson: state, evaluationJson: evaluation });
    return { ok: true, workspaceId: ws.id, state, autoSuitcase: false };
  } else if (op === 'group') {
    const group = String(input.group || 'default');
    state.groups[group] = state.groups[group] || [];
    const id = input.candidateSnapshotId || input.resourceId;
    if (id && !state.groups[group].includes(id)) state.groups[group].push(id);
  } else if (op === 'compare') {
    const ids = Array.isArray(input.candidateSnapshotIds) ? input.candidateSnapshotIds : [];
    state.comparisons.push({
      at: new Date().toISOString(),
      ids,
      focus: input.focus || 'rights',
    });
  } else if (op === 'set_destination') {
    if (!isDestinationAllowed(input.destination)) {
      return { ok: false, error: 'destination_not_allowlisted' };
    }
    state.selectedDestination = input.destination;
  } else if (op === 'save_collection_name') {
    state.collectionName = String(input.collectionName || 'URI collection').slice(0, 120);
  } else {
    return { ok: false, error: 'unknown_op' };
  }

  await updateWorkspace(prisma, ws.id, { stateJson: state });
  return { ok: true, workspaceId: ws.id, state, autoSuitcase: false };
}

/**
 * Place shortlisted (or single) resources into an allowlisted draft destination.
 * Requires explicit confirm. Places into destination via Phase 2 reuse confirm path.
 */
export async function placeWorkspaceResources(prisma, input = {}) {
  if (!workspaceEnabled()) return { ok: false, error: 'uri_workspace_disabled' };
  if (!input.confirm) return { ok: false, error: 'confirmation_required' };

  const ws = await getWorkspace(prisma, input.workspaceId);
  if (!ws) return { ok: false, error: 'workspace_not_found' };

  const destination =
    input.destination ||
    ws.stateJson.selectedDestination ||
    DESTINATION_ADAPTER.DISPLAY_PLAYLIST_DRAFT;
  if (!isDestinationAllowed(destination)) {
    return { ok: false, error: 'destination_not_allowlisted', destination };
  }

  const snapshotIds =
    Array.isArray(input.candidateSnapshotIds) && input.candidateSnapshotIds.length
      ? input.candidateSnapshotIds
      : ws.stateJson.shortlist;

  if (!snapshotIds.length) return { ok: false, error: 'shortlist_empty' };

  const placements = [];
  for (const snapshotId of snapshotIds.slice(0, input.limit || 3)) {
    const selected = await selectResourceCandidate(prisma, {
      sessionId: ws.searchSessionId,
      candidateSnapshotId: snapshotId,
      userId: input.userId || ws.userId,
      custodyMode: input.custodyMode,
      intendedPurpose: ws.intentJson?.purpose || 'resource_workspace',
      targetType: destination,
    });
    if (!selected.ok) {
      const subs = proposeSubstitutions(
        { id: snapshotId },
        { blocked: true, code: selected.error },
        { intent: ws.intentJson },
      );
      placements.push({ ok: false, snapshotId, error: selected.error, substitutions: subs });
      continue;
    }

    const executed = await confirmAndExecuteReuse(prisma, {
      reuseDecisionId: selected.reuseDecision.id,
      confirm: true,
      userId: input.userId || ws.userId,
      destination,
      draftStoreId: input.draftStoreId,
      collectionName: ws.stateJson.collectionName || input.collectionName,
      workspaceId: ws.id,
      playlistName: input.playlistName,
      tenantId: input.tenantId,
      storeId: input.storeId,
    });

    if (!executed.ok) {
      const subs = proposeSubstitutions(
        selected.resource,
        { blocked: executed.blocked, code: executed.error },
        { intent: ws.intentJson, generationFlowAuthorized: false },
      );
      placements.push({
        ok: false,
        snapshotId,
        error: executed.error,
        substitutions: subs,
        searchHint: substitutionToSearchHint(
          subs.actions[0].action,
          selected.resource,
          ws.intentJson,
        ),
      });
      continue;
    }

    placements.push({
      ok: true,
      snapshotId,
      destination,
      draft: executed.draft,
      externalResourceUseId: executed.externalResourceUse?.id,
      binaryStored: false,
      published: false,
    });
  }

  let evaluation = ws.evaluationJson;
  for (const p of placements.filter((x) => x.ok)) {
    evaluation = attachEvaluationEvent(evaluation, {
      type: 'reuse_success',
      destination: p.destination,
      externalResourceUseId: p.externalResourceUseId,
    });
    evaluation = attachEvaluationEvent(evaluation, {
      type: 'attribution',
      ok: true,
      externalResourceUseId: p.externalResourceUseId,
    });
    evaluation = attachEvaluationEvent(evaluation, {
      type: 'retrieval',
      ok: true,
    });
    evaluation = attachEvaluationEvent(evaluation, {
      type: 'draft_ready',
      destination: p.destination,
      targetId: p.draft?.targetId || p.draft?.playlistId,
    });
  }

  const state = {
    ...ws.stateJson,
    selectedDestination: destination,
    incompleteReusePlan: placements.some((p) => !p.ok)
      ? { placements: placements.filter((p) => !p.ok) }
      : null,
  };

  await updateWorkspace(prisma, ws.id, {
    stateJson: state,
    evaluationJson: evaluation,
    status: placements.some((p) => p.ok) ? WORKSPACE_STATUS.COMPLETED : ws.status,
  });

  const okCount = placements.filter((p) => p.ok).length;
  return {
    ok: okCount > 0,
    workspaceId: ws.id,
    destination,
    placements,
    evaluation: summarizeEvaluation(evaluation),
    autoSuitcase: false,
    published: false,
  };
}

export async function workspaceSubstitutions(prisma, input = {}) {
  if (!workspaceEnabled()) return { ok: false, error: 'uri_workspace_disabled' };
  const ws = await getWorkspace(prisma, input.workspaceId);
  const resource = input.resource || { id: input.resourceId };
  return proposeSubstitutions(resource, input.block || { blocked: true }, {
    intent: ws?.intentJson || input.intent,
    preferCardbey: input.preferCardbey,
    generationFlowAuthorized: false,
  });
}

export async function workspaceEvaluation(prisma, workspaceId) {
  const ws = await getWorkspace(prisma, workspaceId);
  if (!ws) return { ok: false, error: 'workspace_not_found' };
  return summarizeEvaluation(ws.evaluationJson);
}
