/**
 * Chat threads API: create and list threads (additive to missionId-based Agent Chat).
 * POST/GET /api/chat/threads, GET /api/chat/threads/:id/messages, GET /api/chat/threads/:id/stream.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { handleThreadSse } from '../realtime/simpleSse.js';

const router = Router();
const prisma = getPrismaClient();

/** GET /api/chat - verify mount (no auth); returns 200 so proxy/clients can confirm route exists */
router.get('/', (req, res) => {
  res.json({ ok: true, service: 'chat-threads', threadsPath: '/api/chat/threads' });
});

/** Ensure current user is a participant of the thread; returns thread or null. */
async function ensureThreadParticipant(threadId, userId) {
  if (!threadId || !userId) return null;
  const participant = await prisma.chatThreadParticipant.findFirst({
    where: {
      threadId,
      participantType: 'user',
      participantId: userId,
    },
    include: { thread: true },
  });
  return participant?.thread ?? null;
}

/** Default agent participants to add when creating a thread */
const DEFAULT_AGENT_PARTICIPANTS = [
  { participantType: 'agent', participantId: 'planner', role: 'member' },
  { participantType: 'agent', participantId: 'researcher', role: 'member' },
];

/**
 * POST /api/chat/threads
 * Create a ChatThread and add current user as owner; optionally add default agents.
 * Body: { missionId?: string, title?: string }
 */
router.post('/threads', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const { missionId, title } = req.body ?? {};
    const missionIdTrimmed = typeof missionId === 'string' ? missionId.trim() || null : null;
    const titleTrimmed = typeof title === 'string' ? title.trim() || null : null;

    const thread = await prisma.chatThread.create({
      data: {
        missionId: missionIdTrimmed ?? undefined,
        title: titleTrimmed ?? undefined,
        createdByUserId: userId,
      },
    });

    await prisma.chatThreadParticipant.create({
      data: {
        threadId: thread.id,
        participantType: 'user',
        participantId: userId,
        role: 'owner',
      },
    });

    for (const agent of DEFAULT_AGENT_PARTICIPANTS) {
      await prisma.chatThreadParticipant.create({
        data: {
          threadId: thread.id,
          participantType: agent.participantType,
          participantId: agent.participantId,
          role: agent.role,
        },
      });
    }

    const participants = await prisma.chatThreadParticipant.findMany({
      where: { threadId: thread.id },
      orderBy: { joinedAt: 'asc' },
    });

    return res.status(201).json({
      ok: true,
      thread: {
        id: thread.id,
        missionId: thread.missionId,
        title: thread.title,
        createdByUserId: thread.createdByUserId,
        createdAt: thread.createdAt,
      },
      participants: participants.map((p) => ({
        id: p.id,
        threadId: p.threadId,
        participantType: p.participantType,
        participantId: p.participantId,
        role: p.role,
        joinedAt: p.joinedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/chat/threads
 * List threads where the current user is a participant ("My conversations").
 */
router.get('/threads', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }

    const participants = await prisma.chatThreadParticipant.findMany({
      where: {
        participantType: 'user',
        participantId: userId,
      },
      include: {
        thread: true,
      },
      orderBy: { joinedAt: 'desc' },
    });

    const threads = participants.map((p) => ({
      id: p.thread.id,
      missionId: p.thread.missionId,
      title: p.thread.title,
      createdByUserId: p.thread.createdByUserId,
      createdAt: p.thread.createdAt,
      myRole: p.role,
      joinedAt: p.joinedAt,
    }));

    return res.json({ ok: true, threads });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/chat/threads/:id
 * Returns the thread (id, missionId, title, createdByUserId, createdAt). Only for participants.
 */
router.get('/threads/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const threadId = req.params.id;
    if (!userId || !threadId) {
      return res.status(400).json({ ok: false, error: 'bad_request', message: 'Thread ID required' });
    }
    const thread = await ensureThreadParticipant(threadId, userId);
    if (!thread) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You are not a participant of this thread',
      });
    }
    return res.json({
      ok: true,
      thread: {
        id: thread.id,
        missionId: thread.missionId,
        title: thread.title,
        createdByUserId: thread.createdByUserId,
        createdAt: thread.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/chat/threads/:id/messages
 * Returns all messages for the thread, ordered by createdAt ASC.
 * Only for users who are participants.
 */
router.get('/threads/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const threadId = req.params.id;
    if (!userId || !threadId) {
      return res.status(400).json({ ok: false, error: 'bad_request', message: 'Thread ID required' });
    }
    const thread = await ensureThreadParticipant(threadId, userId);
    if (!thread) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You are not a participant of this thread',
      });
    }
    const messages = await prisma.agentMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });
    return res.json(messages);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/chat/threads/:id/stream
 * SSE stream for thread messages. Auth: requireAuth, must be a ChatThreadParticipant for :id.
 */
router.get('/threads/:id/stream', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const threadId = req.params.id;
    if (!userId || !threadId) {
      return res.status(400).json({ ok: false, error: 'bad_request', message: 'Thread ID required' });
    }
    const thread = await ensureThreadParticipant(threadId, userId);
    if (!thread) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You are not a participant of this thread',
      });
    }
    handleThreadSse(req, res, threadId);
  } catch (err) {
    next(err);
  }
});

export default router;
