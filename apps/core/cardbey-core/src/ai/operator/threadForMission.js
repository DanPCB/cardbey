/**
 * Create a ConversationThread for a mission (used when starting an Operator run).
 * Mirrors POST /api/threads logic so the dashboard can open "Advanced view" with this thread id.
 */

import { getPrismaClient } from '../../lib/prisma.js';

const DEFAULT_AGENTS = ['planner', 'research'];

/**
 * Create a conversation thread bound to missionId and add user + agents as participants.
 * @param {Object} params
 * @param {string} params.missionId - dashboard mission id (or OrchestratorTask id)
 * @param {string} params.userId - user id (required for createdByUserId and participant)
 * @param {string} [params.tenantId]
 * @param {string} [params.title]
 * @returns {Promise<{ threadId: string }|null>}
 */
export async function createThreadForMission({ missionId, userId, tenantId, title }) {
  if (!missionId || typeof missionId !== 'string' || !missionId.trim()) return null;
  if (!userId || typeof userId !== 'string' || !userId.trim()) return null;
  const prisma = getPrismaClient();
  if (!prisma.conversationThread) return null;

  const thread = await prisma.conversationThread.create({
    data: {
      tenantId: (tenantId && typeof tenantId === 'string' ? tenantId.trim() : null) || userId,
      title: title && typeof title === 'string' ? title.trim() || null : null,
      missionId: missionId.trim(),
      createdByUserId: userId.trim(),
      status: 'active',
    },
  }).catch(() => null);
  if (!thread) return null;

  await prisma.threadParticipant.create({
    data: {
      threadId: thread.id,
      participantType: 'user',
      participantId: userId.trim(),
      role: 'owner',
    },
  }).catch(() => {});

  for (const key of DEFAULT_AGENTS) {
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

  return { threadId: thread.id };
}
