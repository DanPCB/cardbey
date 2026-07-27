// DANH: living-document-platform
/**
 * generate_living_document — Step 6: publish / surface Living Document storefront from ingestion.
 * Reuses buildSmartDocument (companion artifact) + publishDraft republish when possible.
 */

import { getPrismaClient } from '../../prisma.js';
import { buildSmartDocument } from '../../smartDocument/buildSmartDocument.js';
import { publishDraft } from '../../../services/draftStore/publishDraftService.js';
import { appendEvent } from '../../missionBlackboard.js';
import { publicWebBase } from '../../../utils/publicWebBase.js';
import {
  buildVideoPromptFromExtraction,
  mapExtractionToSmartDocumentInput,
} from '../../documentIngestion/livingDocumentMapper.js';
import { persistIngestionContext } from '../../documentIngestion/persistIngestionContext.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    '';
  const missionId =
    (typeof input?.missionId === 'string' && input.missionId.trim()) ||
    (typeof context?.missionId === 'string' && context.missionId.trim()) ||
    null;
  const userId =
    (typeof context?.userId === 'string' && context.userId.trim()) ||
    (typeof input?.userId === 'string' && input.userId.trim()) ||
    null;

  const extractResult =
    input?.extractResult && typeof input.extractResult === 'object' ? input.extractResult : {};
  const extractedData =
    extractResult?.data && typeof extractResult.data === 'object'
      ? extractResult.data
      : input?.extractedData && typeof input.extractedData === 'object'
        ? input.extractedData
        : null;

  if (!storeId || !extractedData) {
    return {
      status: 'ok',
      output: {
        skipped: true,
        reason: 'missing_context',
        livingDocumentCreated: false,
      },
    };
  }

  const prisma = getPrismaClient();
  /** @type {string | null} */
  let slug = null;
  /** @type {string | null} */
  let publishedUrl = null;
  /** @type {string | null} */
  let draftId = null;
  /** @type {string | null} */
  let smartDocumentId = null;

  try {
    const business = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, slug: true, publishedAt: true, userId: true },
    });

    if (business?.slug) {
      slug = business.slug;
      publishedUrl = `${publicWebBase()}/s/${encodeURIComponent(business.slug)}`;
    }

    if (userId && business) {
      try {
        const publishResult = await publishDraft(prisma, {
          storeId,
          userId,
          entrypoint: 'document_ingestion',
        });
        if (publishResult?.slug) {
          slug = publishResult.slug;
          publishedUrl = `${publicWebBase()}/s/${encodeURIComponent(publishResult.slug)}`;
        }
        if (publishResult?.storeId) {
          draftId = publishResult.draftId ?? draftId;
        }
      } catch (publishErr) {
        if (!publishedUrl) {
          console.warn('[generate_living_document] publishDraft skipped:', publishErr?.message ?? publishErr);
        }
      }
    }

    const docData = mapExtractionToSmartDocumentInput(extractedData);
    if (userId) {
      const sdResult = await buildSmartDocument(missionId, docData, {
        userId,
        tenantId: storeId,
      });
      if (sdResult?.documentId) {
        smartDocumentId = sdResult.documentId;
      }
    }

    const livingDocument = {
      draftId,
      slug,
      publishedUrl,
      smartDocumentId,
      createdAt: new Date().toISOString(),
    };

    await persistIngestionContext(prisma, {
      storeId,
      extractedData,
      livingDocument,
      missionId,
    });

    if (missionId) {
      await appendEvent(missionId, 'document_ingestion.living_document', {
        storeId,
        livingDocument,
      }).catch(() => {});
    }

    let videoQueued = false;
    try {
      const projection = await prisma.publishedArtifactProjection.findUnique({
        where: { businessId: storeId },
        select: { heroVideoUrl: true },
      });
      if (!projection?.heroVideoUrl && extractedData.products?.length && userId) {
        const videoPrompt = buildVideoPromptFromExtraction(extractedData);
        const { skillRouter } = await import('../../skills/index.js');
        await skillRouter.route('generate_video', {
          storeId,
          userId,
          missionId,
          toolInput: { userMessage: videoPrompt, source: 'document_ingestion_auto' },
        });
        videoQueued = true;
      }
    } catch (videoErr) {
      console.warn('[generate_living_document] video queue skipped:', videoErr?.message ?? videoErr);
    }

    return {
      status: 'ok',
      output: {
        slug,
        publishedUrl,
        draftId,
        smartDocumentId,
        livingDocumentCreated: Boolean(publishedUrl || smartDocumentId),
        videoQueued,
      },
    };
  } catch (err) {
    console.warn('[generate_living_document] failed (non-fatal):', err?.message ?? err);
    return {
      status: 'ok',
      output: {
        status: 'partial',
        reason: err?.message ?? String(err),
        livingDocumentCreated: false,
        slug,
        publishedUrl,
      },
    };
  }
}

export default execute;
