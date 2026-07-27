/**
 * Conversation threads API: GET/POST /api/threads, GET /api/threads/:threadId.
 * Tenant-scoped; only participants can read; defense-in-depth with canAccessMission when thread has missionId.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { canAccessMission } from './agentMessagesRoutes.js';

const router = Router();

/** GET /api/threads/ok - no auth; verifies router is mounted (returns 200) */
router.get('/ok', (req, res) => {
  res.json({ ok: true, service: 'threads', message: 'GET /api/threads and POST /api/threads are available' });
});

function getTenantId(user) {
  return user?.business?.id ?? user?.id ?? null;
}

const DEFAULT_AGENTS = ['planner', 'research'];

/**
 * Get or create a mission (OrchestratorTask) for a new thread when missionId is omitted.
 * Returns task.id for use as thread.missionId so agent-messages and SSE work unchanged.
 */
async function getOrCreateMission(tenantId, userId, prisma) {
  const task = await prisma.orchestratorTask.create({
    data: {
      entryPoint: 'agent-chat',
      tenantId: tenantId || userId,
      userId,
      status: 'queued',
      request: { source: 'conversation-thread' },
    },
  });
  return task.id;
}

/**
 * Can this user access the thread?
 * - User must be a participant (participantType=user) OR super_admin / dev bypass.
 * - If thread has missionId, also enforce canAccessMission (defense-in-depth).
 */
async function canAccessThread(threadId, user, prisma) {
  if (!threadId || !user?.id) return false;

  const isSuperAdmin = user?.role === 'super_admin';
  const isDevBypass = process.env.NODE_ENV !== 'production' && user?.isDevAdmin === true;
  if (isSuperAdmin || isDevBypass) {
    const thread = await prisma.conversationThread.findUnique({
      where: { id: threadId },
      select: { missionId: true },
    });
    if (!thread) return false;
    if (thread.missionId && !(await canAccessMission(thread.missionId, user))) return false;
    return true;
  }

  const p = await prisma.threadParticipant.findFirst({
    where: {
      threadId,
      participantType: 'user',
      participantId: user.id,
    },
  });
  if (!p) return false;

  const thread = await prisma.conversationThread.findUnique({
    where: { id: threadId },
    select: { missionId: true },
  });
  if (!thread) return false;
  if (thread.missionId && !(await canAccessMission(thread.missionId, user))) return false;
  return true;
}

/**
 * GET /api/threads
 * List threads the current user can access (tenant-scoped; user must be participant).
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const tenantId = getTenantId(req.user);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const prisma = getPrismaClient();

    const participantRows = await prisma.threadParticipant.findMany({
      where: { participantType: 'user', participantId: userId },
      include: { thread: true },
      orderBy: { thread: { updatedAt: 'desc' } },
    });

    const threadList = participantRows
      .map((p) => p.thread)
      .filter((t) => !tenantId || t.tenantId === tenantId);

    const threadsWithPreview = await Promise.all(
      threadList.map(async (t) => {
        let lastMessagePreview = null;
        if (t.missionId) {
          const last = await prisma.agentMessage.findFirst({
            where: { missionId: t.missionId },
            orderBy: { createdAt: 'desc' },
            select: { content: true, createdAt: true },
          });
          if (last?.content && typeof last.content === 'object' && last.content.text) {
            const raw = String(last.content.text);
            lastMessagePreview = raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
          }
        }
        return {
          id: t.id,
          tenantId: t.tenantId,
          title: t.title,
          missionId: t.missionId,
          createdByUserId: t.createdByUserId,
          status: t.status,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          lastMessagePreview: lastMessagePreview ?? undefined,
        };
      })
    );

    return res.json({ ok: true, threads: threadsWithPreview });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/threads
 * Create thread + participants.
 * Body: { title?, missionId?, agents?: [agentKey], members?: [userId] }
 * Default agents: planner, research. If missionId omitted, getOrCreateMission and bind.
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const tenantId = getTenantId(req.user);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const prisma = getPrismaClient();
    const { title, missionId, agents: bodyAgents, members: bodyMembers } = req.body ?? {};

    let missionIdFinal = typeof missionId === 'string' && missionId.trim() ? missionId.trim() : null;
    if (missionIdFinal) {
      const allowed = await canAccessMission(missionIdFinal, req.user);
      if (!allowed) {
        return res.status(403).json({
          ok: false,
          error: 'forbidden',
          code: 'FORBIDDEN_MISSION',
          message: 'You do not have access to that mission.',
        });
      }
    } else {
      missionIdFinal = await getOrCreateMission(tenantId || userId, userId, prisma);
    }

    const thread = await prisma.conversationThread.create({
      data: {
        tenantId: tenantId || userId,
        title: typeof title === 'string' ? title.trim() || null : null,
        missionId: missionIdFinal,
        createdByUserId: userId,
        status: 'active',
      },
    });

    await prisma.threadParticipant.create({
      data: {
        threadId: thread.id,
        participantType: 'user',
        participantId: userId,
        role: 'owner',
      },
    });

    const agentKeys = Array.isArray(bodyAgents) ? bodyAgents : DEFAULT_AGENTS;
    for (const key of agentKeys) {
      const k = String(key).trim();
      if (!k) continue;
      try {
        await prisma.threadParticipant.create({
          data: {
            threadId: thread.id,
            participantType: 'agent',
            participantId: k,
            role: 'member',
          },
        });
      } catch (e) {
        if (e.code !== 'P2002') throw e;
      }
    }

    const memberIds = Array.isArray(bodyMembers) ? bodyMembers : [];
    for (const mid of memberIds) {
      const id = String(mid).trim();
      if (!id || id === userId) continue;
      try {
        await prisma.threadParticipant.create({
          data: {
            threadId: thread.id,
            participantType: 'user',
            participantId: id,
            role: 'member',
          },
        });
      } catch (e) {
        if (e.code !== 'P2002') throw e;
      }
    }

    const participants = await prisma.threadParticipant.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(201).json({
      ok: true,
      thread: {
        id: thread.id,
        tenantId: thread.tenantId,
        title: thread.title,
        missionId: thread.missionId,
        createdByUserId: thread.createdByUserId,
        status: thread.status,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
      participants: participants.map((p) => ({
        id: p.id,
        threadId: p.threadId,
        participantType: p.participantType,
        participantId: p.participantId,
        role: p.role,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/threads/:threadId
 * Return thread + participants + missionId. Only participants can read.
 */
router.get('/:threadId', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const threadId = req.params.threadId;
    if (!userId || !threadId) {
      return res.status(400).json({ ok: false, error: 'bad_request', message: 'Thread ID required' });
    }
    const prisma = getPrismaClient();

    const allowed = await canAccessThread(threadId, req.user, prisma);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this thread',
      });
    }

    const thread = await prisma.conversationThread.findUnique({
      where: { id: threadId },
      include: { participants: true },
    });
    if (!thread) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Thread not found' });
    }

    return res.json({
      ok: true,
      thread: {
        id: thread.id,
        tenantId: thread.tenantId,
        title: thread.title,
        missionId: thread.missionId,
        createdByUserId: thread.createdByUserId,
        status: thread.status,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
      participants: thread.participants.map((p) => ({
        id: p.id,
        threadId: p.threadId,
        participantType: p.participantType,
        participantId: p.participantId,
        role: p.role,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
export { canAccessThread, getTenantId, getOrCreateMission };
