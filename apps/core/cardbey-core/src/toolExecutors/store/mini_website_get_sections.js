/**
 * Tool: mini_website_get_sections — load mini website sections + theme for a store.
 * Delegates snapshot read to miniWebsiteEditorSkill (miniWebsiteAgent has no fetch-only role).
 */

import { getPrismaClient } from '../../lib/prisma.js';
import { miniWebsiteEditorSkill } from '../../skills/miniWebsiteEditorSkill.js';

export async function execute(input = {}, context = {}) {
  const rawStore = input?.storeId ?? context?.storeId;
  const storeId =
    typeof rawStore === 'string' ? rawStore.trim() : rawStore != null ? String(rawStore).trim() : '';

  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'STORE_ID_REQUIRED', message: 'mini_website_get_sections requires storeId' },
    };
  }

  const prisma = getPrismaClient();
  try {
    const data = await miniWebsiteEditorSkill.tools.getCurrentSections({ storeId });

    let miniWebsitePreviewUrl = null;
    let miniWebsiteDraftId = null;
    const missionPipelineId =
      typeof context?.missionId === 'string' && context.missionId.trim() ? context.missionId.trim() : '';
    if (missionPipelineId) {
      try {
        const mp = await prisma.missionPipeline.findUnique({
          where: { id: missionPipelineId },
          select: { outputsJson: true },
        });
        const oj = mp?.outputsJson && typeof mp.outputsJson === 'object' ? mp.outputsJson : {};
        const draftId =
          typeof oj.draftId === 'string' && oj.draftId.trim()
            ? oj.draftId.trim()
            : typeof oj.createdDraftId === 'string' && oj.createdDraftId.trim()
              ? oj.createdDraftId.trim()
              : '';
        const generationRunId =
          typeof oj.generationRunId === 'string' && oj.generationRunId.trim() ? oj.generationRunId.trim() : '';
        if (draftId) {
          miniWebsiteDraftId = draftId;
          miniWebsitePreviewUrl = generationRunId
            ? `/preview/website/${draftId}?generationRunId=${encodeURIComponent(generationRunId)}`
            : `/preview/website/${draftId}`;
        }
      } catch {
        // non-fatal: preview URLs are optional for execution panel
      }
    }

    return {
      status: 'ok',
      output: {
        storeName: data.storeName,
        slug: data.slug,
        sections: data.sections,
        theme: data.theme,
        hasMiniWebsite: Boolean(data.sections?.length),
        ...(miniWebsitePreviewUrl && miniWebsiteDraftId
          ? { miniWebsitePreviewUrl, miniWebsiteDraftId }
          : {}),
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    if (String(message).includes('Store not found') || String(message).includes('not found')) {
      return {
        status: 'failed',
        error: { code: 'STORE_NOT_FOUND', message: 'Store not found' },
      };
    }
    return {
      status: 'failed',
      error: { code: 'MINI_WEBSITE_FETCH_FAILED', message },
    };
  }
}
