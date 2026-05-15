import { getPrismaClient } from '../../prisma.js';
import { publishDraft, PublishDraftError } from '../../../services/draftStore/publishDraftService.js';
import { resolvePostBuildUiContext } from '../resolveStoreIdFromContext.js';
import { publicWebBase } from '../../../utils/publicWebBase.js';

function buildLiveUrl(webBase, { slug, storefrontUrl, storeId }) {
  if (slug && String(slug).trim()) {
    return `${webBase}/s/${encodeURIComponent(String(slug).trim())}`;
  }
  const sf = storefrontUrl != null ? String(storefrontUrl).trim() : '';
  if (sf) {
    if (/^https?:\/\//i.test(sf)) return sf;
    return `${webBase}${sf.startsWith('/') ? '' : '/'}${sf}`;
  }
  if (storeId) return `${webBase}/preview/store/${storeId}?view=public`;
  return null;
}

/**
 * @param {{ blackboardContext?: Record<string, unknown> | null, storeContext?: Record<string, unknown> | null, missionId?: string | null, userId?: string | number | null }} ctx
 */
export async function handlePublishStore(ctx) {
  const prisma = getPrismaClient();
  const rawUid = ctx.userId;
  const userId = rawUid != null && String(rawUid).trim() ? String(rawUid).trim() : null;

  const { storeId, draftId, generationRunId } = await resolvePostBuildUiContext({
    blackboardContext: ctx.blackboardContext ?? null,
    storeContext: ctx.storeContext ?? null,
    missionId: ctx.missionId ?? null,
  });

  if (!draftId && !generationRunId && !storeId) {
    return {
      action: 'message',
      message: "I couldn't find the store to publish. Try using the Publish button in the preview panel.",
    };
  }

  if (!userId) {
    return {
      action: 'message',
      message: 'Authentication required to publish.',
    };
  }

  if (storeId && storeId !== 'temp') {
    const existing = await prisma.business
      .findUnique({
        where: { id: storeId },
        select: { publishedAt: true, slug: true },
      })
      .catch(() => null);

    if (existing?.publishedAt && existing?.slug) {
      const webBase = publicWebBase();
      const liveUrl = `${webBase}/s/${encodeURIComponent(existing.slug)}`;
      return {
        action: 'already_published',
        liveUrl,
        message: `Your store is already live at ${liveUrl}`,
      };
    }
  }

  try {
    const result = await publishDraft(prisma, {
      storeId: storeId ?? 'temp',
      draftId: draftId ?? undefined,
      generationRunId: generationRunId ?? undefined,
      userId,
    });

    const webBase = publicWebBase();
    const liveUrl = buildLiveUrl(webBase, {
      slug: result.slug,
      storefrontUrl: result.storefrontUrl,
      storeId: result.storeId,
    });

    return {
      action: 'published',
      storeId: result.storeId,
      liveUrl,
      slug: result.slug ?? null,
      message: 'Your store is now live 🎉',
    };
  } catch (err) {
    if (err instanceof PublishDraftError) {
      if (err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        return {
          action: 'message',
          message: 'Please verify your email before publishing. Check your inbox for the verification link.',
        };
      }
      if (err.code === 'AUTH_REQUIRED') {
        return {
          action: 'message',
          message: 'Authentication required to publish.',
        };
      }
    }
    return {
      action: 'message',
      message: `Couldn't publish right now: ${err?.message ?? 'unknown error'}. Try the Publish button in the preview panel.`,
    };
  }
}
