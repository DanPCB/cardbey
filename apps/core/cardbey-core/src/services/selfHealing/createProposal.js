/**
 * Governed self-healing proposal creation (no auto-apply).
 * Deduplicates pending proposals for the same type + intent.
 */
import { getPrismaClient } from '../../lib/prisma.js';

/**
 * @param {object} data
 * @param {string} data.type
 * @param {string} data.title
 * @param {string} data.description
 * @param {object} data.suggestedFix
 * @param {object} [data.metadata]
 * @param {boolean} [data.autoCreateProposal]
 * @param {boolean} [data.requiresConfirmation]
 */
export async function createProposal(data) {
  const prisma = getPrismaClient();
  const intent = data.metadata?.intent ? String(data.metadata.intent) : null;
  const matchedSkill = data.metadata?.matchedSkill
    ? String(data.metadata.matchedSkill)
    : null;

  if (intent) {
    const pending = await prisma.selfHealingProposal.findMany({
      where: {
        type: data.type,
        status: { in: ['draft', 'pending_approval'] },
      },
      orderBy: { lastSeen: 'desc' },
      take: 50,
    });

    const existing = pending.find((row) => {
      const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      if (meta.intent !== intent) return false;
      if (matchedSkill && meta.matchedSkill && meta.matchedSkill !== matchedSkill) return false;
      return true;
    });

    if (existing) {
      return prisma.selfHealingProposal.update({
        where: { id: existing.id },
        data: {
          occurrenceCount: { increment: 1 },
          lastSeen: new Date(),
          description: data.description,
          suggestedFix: data.suggestedFix,
          metadata: data.metadata ?? existing.metadata,
        },
      });
    }
  }

  const status = data.autoCreateProposal ? 'pending_approval' : 'draft';

  return prisma.selfHealingProposal.create({
    data: {
      type: data.type,
      title: data.title,
      description: data.description,
      suggestedFix: data.suggestedFix,
      metadata: data.metadata ?? {},
      status,
      requiresConfirmation: data.requiresConfirmation !== false,
    },
  });
}
