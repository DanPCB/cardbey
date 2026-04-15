/**
 * Shared DB reset helper for Vitest suites using Prisma + SQLite.
 *
 * Goal: avoid FK constraint failures during teardown by deleting in a safe
 * child-to-parent order. This is intentionally broad and idempotent.
 *
 * Rules:
 * - Test-only helper (src/test)
 * - Does not require schema cascades
 * - Safe on empty DB
 */

function errorBlob(err) {
  if (!err) return '';
  const parts = [`${err.code ?? ''}`, `${err.message ?? ''}`, JSON.stringify(err.meta ?? {})];
  let c = err.cause;
  let depth = 0;
  while (c && depth++ < 5) {
    parts.push(`${c.code ?? ''}`, `${c.message ?? ''}`);
    c = c.cause;
  }
  return parts.join(' ');
}

async function safeDeleteMany(prisma, modelName) {
  const delegate = prisma?.[modelName];
  if (!delegate?.deleteMany) return;
  try {
    await delegate.deleteMany({});
  } catch (err) {
    // Some suites run against a DB/schema subset; ignore missing-table errors for idempotency.
    const blob = errorBlob(err);
    if (err?.code === 'P2021' || /does not exist/i.test(blob)) return;
    throw err;
  }
}

/**
 * Reset DB state for tests.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function resetDb(prisma) {
  // 1) Mission/orchestrator runtime tables (often Restrict → must delete before User).
  await safeDeleteMany(prisma, 'missionEvent');
  await safeDeleteMany(prisma, 'missionRun');
  await safeDeleteMany(prisma, 'missionPipeline');
  await safeDeleteMany(prisma, 'orchestratorTask');
  await safeDeleteMany(prisma, 'agentRun');
  await safeDeleteMany(prisma, 'agentTask');
  await safeDeleteMany(prisma, 'assignment');
  await safeDeleteMany(prisma, 'mission');

  // 1b) Workflow/RAG/signage tables used by route integration suites (no User FK).
  await safeDeleteMany(prisma, 'campaign');
  await safeDeleteMany(prisma, 'workflow');
  await safeDeleteMany(prisma, 'ragChunk');
  await safeDeleteMany(prisma, 'pairingSession');
  await safeDeleteMany(prisma, 'pairCode');
  await safeDeleteMany(prisma, 'screen');
  await safeDeleteMany(prisma, 'playlist');

  // 2) Chat / conversation tables (createdByUserId relations).
  await safeDeleteMany(prisma, 'chatMessage');
  await safeDeleteMany(prisma, 'chatParticipant');
  await safeDeleteMany(prisma, 'chatThread');
  await safeDeleteMany(prisma, 'conversationMessage');
  await safeDeleteMany(prisma, 'conversationParticipant');
  await safeDeleteMany(prisma, 'conversationThread');

  // 3) Store/draft/promo/catalog (Business is parent of Product/StorePromo via Cascade).
  await safeDeleteMany(prisma, 'intentRequest');
  await safeDeleteMany(prisma, 'intentOpportunity');
  await safeDeleteMany(prisma, 'offer');
  await safeDeleteMany(prisma, 'storePromo');
  await safeDeleteMany(prisma, 'storeOffer');
  await safeDeleteMany(prisma, 'product');
  await safeDeleteMany(prisma, 'draftStore');
  await safeDeleteMany(prisma, 'business');

  // 4) Auth/user-owned misc tables.
  await safeDeleteMany(prisma, 'passwordResetToken');
  await safeDeleteMany(prisma, 'content');
  await safeDeleteMany(prisma, 'demand');
  await safeDeleteMany(prisma, 'greetingCard');

  // 5) Contact sync (Phase 1) tables.
  await safeDeleteMany(prisma, 'contactMatch');
  await safeDeleteMany(prisma, 'contactSuggestion');
  await safeDeleteMany(prisma, 'contactIdentifier');
  await safeDeleteMany(prisma, 'contactSyncJob');
  await safeDeleteMany(prisma, 'contactSyncSource');
  await safeDeleteMany(prisma, 'contactSyncConsent');
  await safeDeleteMany(prisma, 'inviteEvent');
  await safeDeleteMany(prisma, 'userIdentifier');

  // 6) Finally, users.
  await safeDeleteMany(prisma, 'user');
}

