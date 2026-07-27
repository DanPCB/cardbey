import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ConversationService, isPerformerConversationEnabled } from './conversationService.js';

function createMockPrisma() {
  const sessions = new Map();
  const messages = [];
  const pending = [];

  return {
    user: {
      findUnique: vi.fn(async () => ({ id: 'user-1' })),
      upsert: vi.fn(),
    },
    conversationSession: {
      findUnique: vi.fn(async ({ where }) => sessions.get(where.id) ?? null),
      findFirst: vi.fn(async ({ where, orderBy }) => {
        const rows = [...sessions.values()].filter((s) => {
          if (where.userId && s.userId !== where.userId) return false;
          if (where.status && s.status !== where.status) return false;
          if (where.storeId && s.storeId !== where.storeId) return false;
          return true;
        });
        rows.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
        return rows[0] ?? null;
      }),
      create: vi.fn(async ({ data, include }) => {
        const row = {
          id: `sess_${sessions.size + 1}`,
          ...data,
          messageCount: 0,
          messages: [],
          updatedAt: new Date(),
        };
        sessions.set(row.id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }) => {
        const row = sessions.get(where.id);
        if (!row) throw new Error('missing');
        if (data.messageCount?.increment) {
          row.messageCount += data.messageCount.increment;
        }
        Object.assign(row, data, { messageCount: row.messageCount });
        sessions.set(where.id, row);
        return row;
      }),
    },
    conversationMessage: {
      create: vi.fn(async ({ data }) => {
        const row = { id: `msg_${messages.length + 1}`, ...data, createdAt: new Date() };
        messages.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where, orderBy, take }) => {
        let rows = messages.filter((m) => m.sessionId === where.sessionId);
        if (orderBy?.sequence === 'desc') {
          rows = [...rows].sort((a, b) => b.sequence - a.sequence).slice(0, take);
        } else {
          rows = [...rows].sort((a, b) => a.sequence - b.sequence);
        }
        return rows;
      }),
    },
    conversationPendingAction: {
      findMany: vi.fn(async ({ where }) =>
        pending.filter((p) => p.sessionId === where.sessionId && p.status === where.status),
      ),
      create: vi.fn(async ({ data }) => {
        const row = { id: `act_${pending.length + 1}`, ...data, createdAt: new Date() };
        pending.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0;
        for (const row of pending) {
          if (row.sessionId === where.sessionId && row.status === where.status) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      }),
    },
    _sessions: sessions,
    _messages: messages,
    _pending: pending,
  };
}

describe('conversationService', () => {
  it('is enabled by default', () => {
    expect(isPerformerConversationEnabled()).toBe(true);
  });

  it('creates session and stores ordered messages', async () => {
    const prisma = createMockPrisma();
    const service = new ConversationService(prisma);

    const { session } = await service.getOrCreateSession({
      userId: 'user-1',
      storeId: 'store-1',
    });
    expect(session?.id).toBeTruthy();

    await service.addMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Hello',
    });
    await service.addMessage({
      sessionId: session.id,
      role: 'assistant',
      content: 'Hi there',
    });

    const context = await service.buildConversationContext(session.id);
    expect(context.conversationHistory).toHaveLength(2);
    expect(context.conversationHistory[0].role).toBe('user');
    expect(context.conversationHistory[1].content).toBe('Hi there');
  });

  it('skips session create for guest user ids', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique = vi.fn(async () => null);
    const service = new ConversationService(prisma);

    const out = await service.getOrCreateSession({ userId: 'guest_abc-123' });
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('user_not_in_db');
    expect(out.session).toBeNull();
    expect(prisma.conversationSession.create).not.toHaveBeenCalled();
  });

  it('tracks pending actions', async () => {
    const prisma = createMockPrisma();
    const service = new ConversationService(prisma);
    const { session } = await service.getOrCreateSession({ userId: 'user-1' });

    await service.addPendingAction({
      sessionId: session.id,
      kind: 'confirm_action',
      proposedAction: 'launch_campaign',
    });

    const context = await service.buildConversationContext(session.id);
    expect(context.pendingActions).toHaveLength(1);
    expect(context.pendingActions[0].proposedAction).toBe('launch_campaign');
  });
});
