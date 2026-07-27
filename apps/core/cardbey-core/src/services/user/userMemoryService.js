/**
 * User memory read helper — shared by userMemoryRoutes and memoryFacade.
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<import('../../lib/memory/memoryTypes.js').UserMemory | null>}
 */
export async function getUserMemory(prisma, userId) {
  const id = userId ? String(userId).trim() : '';
  if (!id) return null;

  try {
    if (!prisma?.userMemory) return null;
    const row = await prisma.userMemory.findUnique({ where: { userId: id } });
    if (!row) return null;

    const abandoned = Array.isArray(row.abandonedTasks) ? row.abandonedTasks : [];
    const completed = Array.isArray(row.completedTasks) ? row.completedTasks : [];

    return {
      preferences: {},
      recentVisits: [],
      savedItems: [],
      abandonedTasks: abandoned.map((t) => String(t)),
      completedTasks: completed.map((t) => String(t)),
      visitCount: row.visitCount ?? 0,
      lastAction: row.lastAction ?? undefined,
      lastActionAt: row.lastActionAt ? String(row.lastActionAt) : undefined,
    };
  } catch {
    return null;
  }
}
