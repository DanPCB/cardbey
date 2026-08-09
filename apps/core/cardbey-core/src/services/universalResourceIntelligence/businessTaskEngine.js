/**
 * Phase 4 — Business Task Engine.
 * User goals → URI → drafts. Resource Workspace is NOT required.
 *
 * Reuses: openResourceWorkspace, placeWorkspaceResources, kits, graph, recommendations.
 */

import { Features } from '../../config/features.js';
import {
  BUSINESS_TASK,
  BUSINESS_TASK_DESTINATION,
  DESTINATION_ADAPTER,
} from './types.js';
import { openResourceWorkspace, placeWorkspaceResources } from './resourceWorkspace.js';
import { buildContextActions } from './contextActions.js';
import { recommendCrossMediaCombination } from './crossMediaMatcher.js';
import { saveResourceKit } from './resourceKits.js';
import { assembleResourceKit } from './kitAssembly.js';
import { buildResourceGraph } from './resourceGraph.js';
import { recommendResources } from './recommendations.js';
import { suggestCapabilitiesFromPatterns } from './capabilityPatternSuggest.js';

function productIntegrationEnabled() {
  return Boolean(
    Features.universalResourceIntelligence?.v1 &&
      Features.universalResourceIntelligence?.productIntegrationV1,
  );
}

/**
 * Map a business task + natural goal into URI discovery + optional draft placement.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 * @param {string} input.task — BUSINESS_TASK.*
 * @param {string} [input.goal] — e.g. "Create a promotion for my café"
 * @param {boolean} [input.autoPlace=true] — place top candidate into task destination when confirm
 * @param {boolean} [input.confirm=false] — required for placement
 */
export async function runBusinessTask(prisma, input = {}) {
  if (!productIntegrationEnabled()) {
    return { ok: false, error: 'uri_product_integration_disabled' };
  }

  const task = normalizeTask(input.task || input.businessTask, input.goal || input.utterance);
  if (!task) return { ok: false, error: 'business_task_required' };

  const destination =
    input.destination || BUSINESS_TASK_DESTINATION[task] || DESTINATION_ADAPTER.PROMOTION_DRAFT;
  const goal = String(input.goal || input.utterance || defaultGoal(task)).trim();
  const origin = originForTask(task);

  const workspace = await openResourceWorkspace(prisma, {
    utterance: goal,
    query: goal,
    referenceImageUrl: input.referenceImageUrl,
    sourceUrl: input.sourceUrl,
    cardbeyAssetId: input.cardbeyAssetId,
    storeContext: input.storeContext || {
      industry: input.industry,
      channel: channelForTask(task),
      storeId: input.storeId,
    },
    projectContext: input.projectContext,
    consumer: input.consumer || `business_task:${task}`,
    origin,
    destination,
    userId: input.userId,
    collectionName: input.kitName || null,
  });

  if (!workspace.ok) return workspace;

  const candidates = (workspace.candidates || []).map((c) => ({
    ...c,
    contextActions: buildContextActions({
      origin,
      businessTask: task,
      explanation: c.explanation,
      rights: c.rights,
      consumer: workspace.consumer,
    }),
  }));

  const combination = workspace.combination || recommendCrossMediaCombination(candidates, workspace.intent).combination;
  const recommendations = recommendResources({
    industry: workspace.intent?.industry || input.industry,
    purpose: workspace.intent?.purpose,
    channel: workspace.intent?.channel,
    limit: 8,
  });
  const graph = buildResourceGraph({
    industry: workspace.intent?.industry || input.industry,
    businessId: input.storeId || input.businessId,
    resourceId: candidates[0]?.resource?.id,
  });
  const capabilitySuggestions = suggestCapabilitiesFromPatterns({
    industry: workspace.intent?.industry || input.industry,
  });

  // Phase 5 — kits are the primary product output (not flat search results)
  const assembled = assembleResourceKit(candidates, {
    businessTask: task,
    industry: workspace.intent?.industry || input.industry,
    kitName: input.kitName || `${workspace.intent?.industry || 'Business'} Kit`,
    userId: input.userId,
    workspaceId: workspace.workspaceId,
    excludeReferenceOnly: Boolean(input.excludeReferenceOnly),
  });
  let kit = assembled;
  if ((input.saveKit || input.kitName) && !assembled.kit) {
    kit = saveResourceKit({
      name: input.kitName || `${workspace.intent?.industry || 'Business'} Kit`,
      industry: workspace.intent?.industry,
      resourceIds: candidates.slice(0, 8).map((c) => c.resource.id),
      userId: input.userId,
      workspaceId: workspace.workspaceId,
      businessTask: task,
    });
  }

  let placement = null;
  if (input.autoPlace !== false && input.confirm === true && candidates[0]?.candidateSnapshotId) {
    placement = await placeWorkspaceResources(prisma, {
      workspaceId: workspace.workspaceId,
      destination,
      candidateSnapshotIds: [candidates[0].candidateSnapshotId],
      confirm: true,
      userId: input.userId,
      draftStoreId: input.draftStoreId,
      storeId: input.storeId,
      tenantId: input.tenantId,
      playlistName: input.playlistName || goal.slice(0, 80),
      collectionName: input.kitName,
    });
  }

  return {
    ok: true,
    mode: 'invisible_intelligence',
    businessTask: task,
    goal,
    origin,
    destination,
    workspaceId: workspace.workspaceId,
    sessionId: workspace.sessionId,
    intent: workspace.intent,
    candidates,
    combination,
    recommendations: recommendations.recommendations,
    graph: graph.graph,
    capabilitySuggestions: capabilitySuggestions.suggestions,
    kit: kit?.kit || null,
    kitAssembly: assembled?.summary
      ? { slots: assembled.slots, summary: assembled.summary }
      : null,
    federation: workspace.searchPlan?.federation || null,
    placement,
    ui: {
      exposeResourceWorkspace: false,
      primaryQuestion: 'What are you trying to achieve?',
      neverAsk: 'Search resources',
    },
    next: placement?.ok
      ? { openDraft: placement.placements?.[0]?.draft }
      : {
          confirmPlace: 'POST /api/resource-intelligence/tasks/run with confirm:true',
          adminWorkspace: '/control-center/resource-intelligence/workspace',
        },
    authority: 'universal_resource_intelligence',
    published: false,
  };
}

/**
 * Place a specific candidate action from a product surface (no workspace UI).
 */
export async function runCandidateAction(prisma, input = {}) {
  if (!productIntegrationEnabled()) {
    return { ok: false, error: 'uri_product_integration_disabled' };
  }
  if (!input.confirm) return { ok: false, error: 'confirmation_required' };
  if (!input.workspaceId || !input.candidateSnapshotId) {
    return { ok: false, error: 'workspaceId_and_candidateSnapshotId_required' };
  }

  const { actionToDestination } = await import('./contextActions.js');
  const destination =
    input.destination || actionToDestination(input.action) || DESTINATION_ADAPTER.PROMOTION_DRAFT;

  return placeWorkspaceResources(prisma, {
    workspaceId: input.workspaceId,
    destination,
    candidateSnapshotIds: [input.candidateSnapshotId],
    confirm: true,
    userId: input.userId,
    draftStoreId: input.draftStoreId,
    storeId: input.storeId,
    tenantId: input.tenantId,
    playlistName: input.playlistName,
  });
}

function normalizeTask(task, goal = '') {
  if (task && BUSINESS_TASK[task]) return BUSINESS_TASK[task];
  if (task && Object.values(BUSINESS_TASK).includes(task)) return task;
  const g = String(goal || '').toLowerCase();
  if (/playlist|display|signage|screen/.test(g)) return BUSINESS_TASK.CREATE_DISPLAY_PLAYLIST;
  if (/instagram|facebook|tiktok|social/.test(g)) return BUSINESS_TASK.CREATE_SOCIAL_POST;
  if (/hero|landing|banner|website|storefront/.test(g)) return BUSINESS_TASK.CREATE_STOREFRONT_HERO;
  if (/creator|music|footage|template pack/.test(g)) return BUSINESS_TASK.ASSEMBLE_CREATOR_PACK;
  if (/promotion|promo|campaign|offer/.test(g)) return BUSINESS_TASK.CREATE_PROMOTION;
  if (/café|cafe|business|grow/.test(g)) return BUSINESS_TASK.ASSISTANT_ASSEMBLE_DRAFT;
  return null;
}

function defaultGoal(task) {
  switch (task) {
    case BUSINESS_TASK.CREATE_DISPLAY_PLAYLIST:
      return 'Build a café display playlist with a relaxing atmosphere';
    case BUSINESS_TASK.CREATE_PROMOTION:
      return 'Create a Facebook promotion for my café';
    case BUSINESS_TASK.CREATE_STOREFRONT_HERO:
      return 'Create a landing page hero';
    case BUSINESS_TASK.CREATE_SOCIAL_POST:
      return 'Create an Instagram post for my café';
    case BUSINESS_TASK.ASSEMBLE_CREATOR_PACK:
      return 'Assemble music, footage, and templates for my project';
    default:
      return 'Create a promotion for my café';
  }
}

function originForTask(task) {
  switch (task) {
    case BUSINESS_TASK.CREATE_DISPLAY_PLAYLIST:
      return 'display';
    case BUSINESS_TASK.CREATE_PROMOTION:
      return 'store_builder';
    case BUSINESS_TASK.CREATE_STOREFRONT_HERO:
    case BUSINESS_TASK.CREATE_LANDING_HERO:
      return 'website_builder';
    case BUSINESS_TASK.CREATE_SOCIAL_POST:
      return 'social';
    case BUSINESS_TASK.ASSEMBLE_CREATOR_PACK:
      return 'creator_studio';
    default:
      return 'assistant';
  }
}

function channelForTask(task) {
  switch (task) {
    case BUSINESS_TASK.CREATE_DISPLAY_PLAYLIST:
      return 'display';
    case BUSINESS_TASK.CREATE_SOCIAL_POST:
      return 'social';
    case BUSINESS_TASK.CREATE_STOREFRONT_HERO:
    case BUSINESS_TASK.CREATE_LANDING_HERO:
      return 'web';
    default:
      return 'marketing';
  }
}

export function listBusinessTasks() {
  return Object.values(BUSINESS_TASK).map((task) => ({
    task,
    destination: BUSINESS_TASK_DESTINATION[task],
    exampleGoal: defaultGoal(task),
  }));
}
