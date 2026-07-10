/**
 * Block public publish when research-backed catalog awaits owner confirmation.
 */

/**
 * @param {object} draftInput
 * @returns {string|null}
 */
export function resolveMissionIdFromDraftInput(draftInput) {
  if (!draftInput || typeof draftInput !== 'object') return null;
  const direct = typeof draftInput.missionId === 'string' ? draftInput.missionId.trim() : '';
  if (direct) return direct;
  const runId =
    typeof draftInput.generationRunId === 'string' ? draftInput.generationRunId.trim() : '';
  return runId || null;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ input?: unknown, generationRunId?: string|null }} draft
 * @returns {Promise<{ blocked: boolean, missionId?: string, reason?: string }>}
 */
export async function getStoreResearchPublishBlockReason(prisma, draft) {
  const rawInput =
    draft?.input && typeof draft.input === 'object'
      ? draft.input
      : typeof draft?.input === 'string'
        ? (() => {
            try {
              return JSON.parse(draft.input);
            } catch {
              return {};
            }
          })()
        : {};
  const missionId =
    resolveMissionIdFromDraftInput(rawInput) ||
    (typeof draft?.generationRunId === 'string' ? draft.generationRunId.trim() : '') ||
    null;
  if (!missionId) return { blocked: false };

  const mrow = await prisma.mission
    .findUnique({ where: { id: missionId }, select: { context: true } })
    .catch(() => null);
  const ctx = mrow?.context && typeof mrow.context === 'object' ? mrow.context : {};
  const research =
    ctx.storeCreationResearch && typeof ctx.storeCreationResearch === 'object'
      ? ctx.storeCreationResearch
      : null;
  if (!research) return { blocked: false };
  if (research.ownerConfirmed === true) return { blocked: false };
  if (!research.ownerReviewRequired) return { blocked: false };

  return {
    blocked: true,
    missionId,
    reason: 'store_research_owner_review_required',
  };
}
