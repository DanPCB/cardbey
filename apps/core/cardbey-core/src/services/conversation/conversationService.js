/**
 * Conversation Service — continuous Performer conversation sessions (Phase 0).
 */
import { getPrismaClient } from '../../lib/prisma.js';

const DEFAULT_MESSAGE_LIMIT = 15;
const MAX_MESSAGE_LIMIT = 50;

function modelAvailable(prisma) {
  const delegate = prisma?.conversationSession;
  return Boolean(
    delegate &&
      (typeof delegate.findFirst === 'function' ||
        typeof delegate.create === 'function' ||
        typeof delegate.findUnique === 'function'),
  );
}

function estimateTokens(text) {
  const len = String(text ?? '').length;
  return len ? Math.ceil(len / 4) : 0;
}

function mapMessageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.sessionId,
    missionId: row.missionId ?? null,
    role: row.role,
    content: row.content,
    contentJson: row.contentJson ?? null,
    toolCalls: row.toolCalls ?? null,
    artifacts: row.artifacts ?? null,
    tokenCount: row.tokenCount ?? null,
    sequence: row.sequence,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ''),
  };
}

export function isPerformerConversationEnabled() {
  return String(process.env.ENABLE_PERFORMER_CONVERSATION ?? 'true').trim().toLowerCase() !== 'false';
}

export class ConversationService {
  constructor(prisma = getPrismaClient()) {
    this.prisma = prisma;
  }

  async getOrCreateSession(
    { userId, storeId = null, surface = 'performer_console', sessionId = null },
    prisma = this.prisma,
  ) {
    if (!modelAvailable(prisma)) {
      return { session: null, skipped: true };
    }

    const uid = String(userId ?? '').trim();
    if (!uid) {
      const err = new Error('userId is required');
      err.statusCode = 400;
      throw err;
    }

    const sid = sessionId ? String(sessionId).trim() : '';
    if (sid) {
      const existing = await prisma.conversationSession.findUnique({
        where: { id: sid },
        include: {
          messages: { orderBy: { sequence: 'asc' }, take: DEFAULT_MESSAGE_LIMIT },
        },
      });
      if (existing && existing.userId === uid && existing.status === 'active') {
        await this.touchSession(sid, prisma);
        return { session: existing, skipped: false, created: false };
      }
    }

    const session = await prisma.conversationSession.create({
      data: {
        userId: uid,
        storeId: storeId ? String(storeId).trim() : null,
        surface: String(surface || 'performer_console').trim() || 'performer_console',
        status: 'active',
        lastMessageAt: new Date(),
      },
      include: {
        messages: { orderBy: { sequence: 'asc' }, take: DEFAULT_MESSAGE_LIMIT },
      },
    });

    return { session, skipped: false, created: true };
  }

  async addMessage(
    {
      sessionId,
      role,
      content,
      missionId = null,
      contentJson = null,
      toolCalls = null,
      artifacts = null,
    },
    prisma = this.prisma,
  ) {
    if (!modelAvailable(prisma)) {
      return { message: null, skipped: true };
    }

    const sid = String(sessionId ?? '').trim();
    const text = String(content ?? '').trim();
    if (!sid || !text) {
      const err = new Error('sessionId and content are required');
      err.statusCode = 400;
      throw err;
    }

    const session = await prisma.conversationSession.findUnique({ where: { id: sid } });
    if (!session) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }

    const sequence = session.messageCount;
    const message = await prisma.conversationMessage.create({
      data: {
        sessionId: sid,
        missionId: missionId ? String(missionId).trim() : null,
        role: String(role ?? 'user').trim() || 'user',
        content: text,
        contentJson,
        toolCalls,
        artifacts,
        sequence,
        tokenCount: estimateTokens(text),
      },
    });

    await prisma.conversationSession.update({
      where: { id: sid },
      data: {
        messageCount: { increment: 1 },
        lastMessageAt: new Date(),
        ...(missionId ? { activeMissionId: String(missionId).trim() } : {}),
      },
    });

    return { message: mapMessageRow(message), skipped: false };
  }

  async getRecentMessages(sessionId, limit = DEFAULT_MESSAGE_LIMIT, prisma = this.prisma) {
    if (!modelAvailable(prisma)) return [];
    const sid = String(sessionId ?? '').trim();
    if (!sid) return [];

    const take = Math.min(Math.max(Number(limit) || DEFAULT_MESSAGE_LIMIT, 1), MAX_MESSAGE_LIMIT);
    const rows = await prisma.conversationMessage.findMany({
      where: { sessionId: sid },
      orderBy: { sequence: 'desc' },
      take,
    });
    return rows.reverse().map(mapMessageRow);
  }

  async buildConversationContext(sessionId, { maxMessages = DEFAULT_MESSAGE_LIMIT } = {}, prisma = this.prisma) {
    if (!modelAvailable(prisma)) {
      return {
        conversationHistory: [],
        pendingActions: [],
        messageCount: 0,
        tokenEstimate: 0,
        skipped: true,
      };
    }

    const sid = String(sessionId ?? '').trim();
    const messages = await this.getRecentMessages(sid, maxMessages, prisma);
    const pendingActions = await prisma.conversationPendingAction.findMany({
      where: { sessionId: sid, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    const conversationHistory = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    return {
      conversationHistory,
      pendingActions: pendingActions.map((a) => ({
        id: a.id,
        kind: a.kind,
        proposedAction: a.proposedAction ?? null,
        missionId: a.missionId ?? null,
        stepId: a.stepId ?? null,
        payload: a.payload ?? null,
      })),
      messageCount: messages.length,
      tokenEstimate: messages.reduce((sum, m) => sum + (m.tokenCount ?? estimateTokens(m.content)), 0),
      skipped: false,
    };
  }

  async addPendingAction(
    { sessionId, kind, proposedAction = null, missionId = null, stepId = null, payload = null },
    prisma = this.prisma,
  ) {
    if (!modelAvailable(prisma)) {
      return { action: null, skipped: true };
    }

    const sid = String(sessionId ?? '').trim();
    if (!sid || !kind) {
      const err = new Error('sessionId and kind are required');
      err.statusCode = 400;
      throw err;
    }

    const action = await prisma.conversationPendingAction.create({
      data: {
        sessionId: sid,
        kind: String(kind).trim(),
        proposedAction: proposedAction ? String(proposedAction).trim() : null,
        missionId: missionId ? String(missionId).trim() : null,
        stepId: stepId ? String(stepId).trim() : null,
        payload,
        status: 'pending',
      },
    });

    return { action, skipped: false };
  }

  async resolvePendingAction(actionId, resolution = 'resolved', prisma = this.prisma) {
    if (!modelAvailable(prisma)) {
      return { action: null, skipped: true };
    }

    const id = String(actionId ?? '').trim();
    if (!id) {
      const err = new Error('actionId is required');
      err.statusCode = 400;
      throw err;
    }

    const action = await prisma.conversationPendingAction.update({
      where: { id },
      data: {
        status: String(resolution || 'resolved').trim() || 'resolved',
        resolvedAt: new Date(),
      },
    });

    return { action, skipped: false };
  }

  async resolvePendingActionsForSession(sessionId, resolution = 'resolved', prisma = this.prisma) {
    if (!modelAvailable(prisma)) return { count: 0, skipped: true };
    const sid = String(sessionId ?? '').trim();
    if (!sid) return { count: 0, skipped: false };

    const result = await prisma.conversationPendingAction.updateMany({
      where: { sessionId: sid, status: 'pending' },
      data: { status: resolution, resolvedAt: new Date() },
    });

    return { count: result.count, skipped: false };
  }

  async touchSession(sessionId, prisma = this.prisma) {
    if (!modelAvailable(prisma)) return null;
    const sid = String(sessionId ?? '').trim();
    if (!sid) return null;
    return prisma.conversationSession.update({
      where: { id: sid },
      data: { lastMessageAt: new Date() },
    });
  }

  async assertSessionOwner(sessionId, userId, prisma = this.prisma) {
    const sid = String(sessionId ?? '').trim();
    const uid = String(userId ?? '').trim();
    const session = await prisma.conversationSession.findUnique({ where: { id: sid } });
    if (!session) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }
    if (session.userId !== uid) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }
    return session;
  }
}

const conversationService = new ConversationService();
export default conversationService;
