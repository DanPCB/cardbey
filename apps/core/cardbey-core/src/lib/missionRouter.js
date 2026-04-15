/**
 * Unified mission router: creates and reads MissionRun (Prisma) for both fast-path and agent-path.
 * MissionRun shadows MissionPipeline and orchestrator/operator runs until full migration.
 */

import { getPrismaClient } from '../lib/prisma.js';

const FAST_PATH_INTENTS = [
  'launch_campaign',
  'rewrite_descriptions',
  'generate_tags',
  'generate_social_posts',
  'create_offer',
  'improve_hero',
  'analyze_store',
];

const AGENT_PATH_INTENTS = [
  'create_store',
  'create_promotion',
  'full_campaign',
  'improve_store',
  'analyze_performance',
];

/**
 * Resolve mode from intent (or force).
 * @param {string} intentType
 * @param {string} [forceMode] - 'fast' | 'agent'
 * @returns {'fast'|'agent'}
 */
export function resolveMode(intentType, forceMode) {
  if (forceMode) return forceMode;
  if (FAST_PATH_INTENTS.includes(intentType)) return 'fast';
  if (AGENT_PATH_INTENTS.includes(intentType)) return 'agent';
  return 'agent';
}

/**
 * Create a unified MissionRun record.
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} [params.storeId]
 * @param {string} params.intentType
 * @param {string} [params.title]
 * @param {'fast'|'agent'} [params.mode]
 * @param {boolean} [params.requiresConfirmation]
 * @param {object} [params.context]
 * @returns {Promise<import('@prisma/client').MissionRun>}
 */
export async function createMissionRun({
  userId,
  storeId,
  intentType,
  title,
  mode,
  requiresConfirmation = false,
  context = {},
}) {
  const prisma = getPrismaClient();
  const resolvedMode = resolveMode(intentType, mode);

  const run = await prisma.missionRun.create({
    data: {
      userId,
      storeId: storeId ?? null,
      intentType,
      title: title ?? intentType.replace(/_/g, ' '),
      mode: resolvedMode,
      status: 'queued',
      runState: 'idle',
      requiresConfirmation,
      planSnapshot: context ?? {},
    },
  });

  console.log('[MissionRouter] created run:', {
    id: run.id,
    intentType,
    mode: resolvedMode,
    requiresConfirmation,
  });

  return run;
}

/**
 * Get unified state for a MissionRun by id.
 * @param {string} id - MissionRun id
 * @returns {Promise<object|null>} Unified state shape or null
 */
export async function getMissionRunState(id) {
  const prisma = getPrismaClient();
  const run = await prisma.missionRun.findUnique({
    where: { id },
    include: {
      agentMessages: {
        orderBy: { createdAt: 'asc' },
        take: 50,
      },
    },
  });
  if (!run) return null;
  return {
    missionId: run.id,
    kind: 'mission_run',
    intentType: run.intentType,
    title: run.title,
    mode: run.mode,
    status: run.status,
    runState: run.runState,
    steps: run.steps ?? [],
    lastResult: run.lastResult ?? null,
    planSnapshot: run.planSnapshot ?? null,
    consensusRecord: run.consensusRecord ?? null,
    contentBundle: run.contentBundle ?? null,
    scheduleBundle: run.scheduleBundle ?? null,
    requiresConfirmation: run.requiresConfirmation,
    agentMessages: run.agentMessages ?? [],
  };
}
