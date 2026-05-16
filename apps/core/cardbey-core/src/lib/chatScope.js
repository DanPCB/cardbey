/**
 * Chat scope resolution for floating vs full chat. Reuses ConversationThread and permissions.
 * No new storage tables; additive only. Used by POST /api/chat/resolve-scope.
 */

import { canAccessThread, getTenantId } from '../routes/threadsRoutes.js';
import { canAccessMission } from '../routes/agentMessagesRoutes.js';
import { canAccessStore } from './internalTools.js';

const DEFAULT_AGENTS = ['planner', 'research'];

/**
 * Detect Prisma/DB errors indicating ConversationThread.kind or scopeKey column is missing (migration not applied).
 * @param {Error} err
 * @returns {boolean}
 */
function isSchemaOutOfDate(err) {
  if (!err || typeof err.message !== 'string') return false;
  const msg = err.message.toLowerCase();
  const hasKindOrScope = msg.includes('kind') || msg.includes('scopekey') || msg.includes('scope_key');
  const looksLikeMissingColumn =
    msg.includes('no such column') ||
    msg.includes('does not exist') ||
    msg.includes('unknown arg') ||
    msg.includes('invalid column') ||
    err.code === 'P2010' ||
    err.code === 'P2009';
  return hasKindOrScope && looksLikeMissingColumn;
}

/**
 * Add default participants (user as owner, planner + research as agents) to a thread.
 * @param {object} prisma
 * @param {string} threadId
 * @param {string} userId
 */
async function addDefaultParticipants(prisma, threadId, userId) {
  await prisma.threadParticipant.create({
    data: {
      threadId,
      participantType: 'user',
      participantId: userId,
      role: 'owner',
    },
  });
  for (const key of DEFAULT_AGENTS) {
    try {
      await prisma.threadParticipant.create({
        data: {
          threadId,
          participantType: 'agent',
          participantId: key,
          role: 'member',
        },
      });
    } catch (e) {
      if (e.code !== 'P2002') throw e;
    }
  }
}

/**
 * Resolve chat scope from threadId, missionId, or storeId. Enforces canAccessThread / canAccessMission / canAccessStore.
 * Find-or-create uses existing ConversationThread table with kind/scopeKey; no new tables.
 *
 * @param {object} prisma - Prisma client
 * @param {object} user - Authenticated user { id, business?.id }
 * @param {{ threadId?: string, missionId?: string, storeId?: string }} params
 * @returns {Promise<{ threadId: string, missionId: string|null, scope: string, scopeLabel: string }>}
 * @throws {Error} with code FORBIDDEN / BAD_REQUEST for invalid or unauthorized access
 */
export async function resolveChatScope(prisma, user, params) {
  const userId = user?.id;
  if (!userId) {
    const err = new Error('Not authenticated');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const tenantId = getTenantId(user) || userId;
  const threadId = typeof params?.threadId === 'string' ? params.threadId.trim() || null : null;
  const missionIdParam = typeof params?.missionId === 'string' ? params.missionId.trim() || null : null;
  const storeId = typeof params?.storeId === 'string' ? params.storeId.trim() || null : null;

  try {
    return await resolveChatScopeInner(prisma, user, { userId, tenantId, threadId, missionIdParam, storeId });
  } catch (err) {
    if (isSchemaOutOfDate(err)) {
      const schemaErr = new Error('DB schema out of date: missing ConversationThread.kind. Run migrations.');
      schemaErr.code = 'SCHEMA_OUT_OF_DATE';
      throw schemaErr;
    }
    throw err;
  }
}

async function resolveChatScopeInner(prisma, user, { userId, tenantId, threadId, missionIdParam, storeId }) {
  // 1) threadId provided
  if (threadId) {
    const allowed = await canAccessThread(threadId, user, prisma);
    if (!allowed) {
      const err = new Error('You do not have access to this thread');
      err.code = 'FORBIDDEN';
      throw err;
    }
    const thread = await prisma.conversationThread.findUnique({
      where: { id: threadId },
      select: { missionId: true, title: true },
    });
    if (!thread) {
      const err = new Error('Thread not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const scopeLabel = thread.title?.trim() || (thread.missionId ? `Working on: Mission ${thread.missionId}` : 'Thread');
    return {
      threadId,
      missionId: thread.missionId ?? null,
      scope: 'thread',
      scopeLabel,
    };
  }

  // 2) missionId provided
  if (missionIdParam) {
    const allowed = await canAccessMission(missionIdParam, user);
    if (!allowed) {
      const err = new Error('You do not have access to this mission');
      err.code = 'FORBIDDEN';
      throw err;
    }
    let thread = await prisma.conversationThread.findFirst({
      where: { missionId: missionIdParam },
      select: { id: true, missionId: true, title: true },
    });
    if (!thread) {
      thread = await prisma.conversationThread.create({
        data: {
          tenantId,
          title: null,
          missionId: missionIdParam,
          createdByUserId: userId,
          status: 'active',
          kind: 'mission_bound',
          scopeKey: null,
        },
      });
      await addDefaultParticipants(prisma, thread.id, userId);
    }
    const scopeLabel = thread.title?.trim() || `Working on: Mission ${missionIdParam}`;
    return {
      threadId: thread.id,
      missionId: thread.missionId ?? missionIdParam,
      scope: 'mission',
      scopeLabel,
    };
  }

  // 3) storeId provided
  if (storeId) {
    const allowed = await canAccessStore(prisma, storeId, userId);
    if (!allowed) {
      const err = new Error('You do not have access to this store');
      err.code = 'FORBIDDEN';
      throw err;
    }
    const scopeKey = `store:${storeId}`;
    let thread = await prisma.conversationThread.findFirst({
      where: { kind: 'store_default', scopeKey },
      select: { id: true, missionId: true, title: true },
    });
    if (!thread) {
      thread = await prisma.conversationThread.create({
        data: {
          tenantId,
          title: null,
          missionId: null,
          createdByUserId: userId,
          status: 'active',
          kind: 'store_default',
          scopeKey,
        },
      });
      await addDefaultParticipants(prisma, thread.id, userId);
    }
    let storeName = storeId;
    try {
      const business = await prisma.business.findUnique({
        where: { id: storeId },
        select: { name: true },
      });
      if (business?.name) storeName = business.name;
    } catch (_) {}
    const scopeLabel = `Working on: Store ${storeName}`;
    return {
      threadId: thread.id,
      missionId: thread.missionId ?? null,
      scope: 'store',
      scopeLabel,
    };
  }

  // 4) user default
  const scopeKey = `user:${userId}`;
  let thread = await prisma.conversationThread.findFirst({
    where: { kind: 'user_default', scopeKey },
    select: { id: true, missionId: true },
  });
  if (!thread) {
    thread = await prisma.conversationThread.create({
      data: {
        tenantId,
        title: null,
        missionId: null,
        createdByUserId: userId,
        status: 'active',
        kind: 'user_default',
        scopeKey,
      },
    });
    await addDefaultParticipants(prisma, thread.id, userId);
  }
  return {
    threadId: thread.id,
    missionId: thread.missionId ?? null,
    scope: 'user_default',
    scopeLabel: 'General',
  };
}

/**
 * Ensure the thread has a mission (OrchestratorTask). If thread.missionId is null, create one and update the thread.
 * Used by floating chat when user sends first message in store/user_default scope.
 * @param {object} prisma
 * @param {object} user - { id }
 * @param {string} threadId
 * @returns {Promise<{ missionId: string }>}
 */
export async function ensureMissionForThread(prisma, user, threadId) {
  if (!threadId || !user?.id) {
    const err = new Error('threadId and user required');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  const allowed = await canAccessThread(threadId, user, prisma);
  if (!allowed) {
    const err = new Error('You do not have access to this thread');
    err.code = 'FORBIDDEN';
    throw err;
  }
  const thread = await prisma.conversationThread.findUnique({
    where: { id: threadId },
    select: { missionId: true, tenantId: true, createdByUserId: true },
  });
  if (!thread) {
    const err = new Error('Thread not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (thread.missionId) {
    return { missionId: thread.missionId };
  }
  const task = await prisma.orchestratorTask.create({
    data: {
      entryPoint: 'agent-chat',
      tenantId: thread.tenantId || thread.createdByUserId,
      userId: thread.createdByUserId,
      status: 'queued',
      request: { source: 'floating-chat-ensure' },
    },
  });
  await prisma.conversationThread.update({
    where: { id: threadId },
    data: { missionId: task.id, updatedAt: new Date() },
  });
  return { missionId: task.id };
}
