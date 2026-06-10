/**
 * Phase 10 — Mirror mission outputs into suitcase vault (deduped).
 */
import { createSuitcaseItem } from './suitcaseItemService.js';

function pickString(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function inferMissionOutputItem(missionOutputs, context) {
  const outputs = missionOutputs && typeof missionOutputs === 'object' ? missionOutputs : {};
  const suitcaseItemId = pickString(outputs, 'suitcaseItemId');
  if (suitcaseItemId) {
    return { skip: true, reason: 'already_linked' };
  }

  const videoUrl =
    pickString(outputs, 'videoUrl', 'video_url', 'url') ||
    pickString(outputs.video, 'url', 'videoUrl');
  if (videoUrl) {
    return {
      sourceType: 'video',
      contentType: 'video',
      title: pickString(outputs, 'title', 'name') || 'Generated video',
      fileUrl: videoUrl,
      thumbnailUrl: pickString(outputs, 'thumbnailUrl', 'thumbnail_url', 'posterUrl'),
      payload: outputs,
    };
  }

  const slideshowUrl = pickString(outputs, 'slideshowUrl', 'slideshow_url', 'deckUrl');
  if (slideshowUrl) {
    return {
      sourceType: 'slideshow',
      contentType: 'mixed',
      title: pickString(outputs, 'title', 'name') || 'Slideshow',
      fileUrl: slideshowUrl,
      payload: outputs,
    };
  }

  const offer = outputs.offer ?? outputs.offerDraft ?? outputs.draft;
  if (offer && typeof offer === 'object') {
    const offerTitle = pickString(offer, 'title', 'name') || 'Offer';
    return {
      sourceType: 'offer_draft',
      contentType: 'json',
      title: `Offer draft — ${offerTitle}`,
      payload: offer,
      summary: pickString(offer, 'description', 'summary'),
    };
  }

  const reportPdf = pickString(outputs, 'reportPdfUrl', 'pdfUrl', 'reportUrl');
  if (reportPdf) {
    return {
      sourceType: 'business_report',
      contentType: 'pdf',
      title: pickString(outputs, 'title', 'reportTitle') || 'Business report',
      fileUrl: reportPdf,
      payload: outputs,
    };
  }

  if (outputs.report && typeof outputs.report === 'object') {
    return {
      sourceType: 'business_report',
      contentType: 'json',
      title: pickString(outputs.report, 'title') || 'Business report',
      payload: outputs.report,
    };
  }

  const keys = Object.keys(outputs);
  if (keys.length === 0) {
    return { skip: true, reason: 'empty_outputs' };
  }

  return {
    sourceType: 'artifact',
    contentType: 'json',
    title: pickString(outputs, 'title', 'artifactTitle') || `Mission output — ${context.actionType || 'artifact'}`,
    payload: outputs,
  };
}

/**
 * @param {object} input
 */
export async function mirrorMissionOutputToSuitcase(input, prisma) {
  const ownerId = String(input.ownerId ?? '').trim();
  const missionId = String(input.missionId ?? '').trim();
  if (!ownerId || !missionId) return { skipped: true, reason: 'missing_ids' };

  const inferred = inferMissionOutputItem(input.missionOutputs, {
    actionType: input.actionType,
    missionStatus: input.missionStatus,
  });
  if (inferred.skip) return { skipped: true, reason: inferred.reason };

  const idempotencyKey = `mission:${ownerId}:${missionId}:${inferred.sourceType}`;

  const result = await createSuitcaseItem(
    {
      ownerId,
      storeId: input.storeId ? String(input.storeId).trim() : null,
      missionId,
      sourceType: inferred.sourceType,
      contentType: inferred.contentType,
      title: inferred.title,
      summary: inferred.summary ?? null,
      fileUrl: inferred.fileUrl ?? null,
      thumbnailUrl: inferred.thumbnailUrl ?? null,
      payload: inferred.payload ?? null,
      tags: ['mission', inferred.sourceType],
      metadata: {
        missionId,
        missionStatus: input.missionStatus ?? null,
        actionType: input.actionType ?? null,
        outcomeEventId: input.outcomeEventId ?? null,
        generatedBy: 'mission_runtime',
        version: 'phase_10',
      },
      idempotencyKey,
    },
    prisma,
  );

  return { skipped: Boolean(result.skipped), item: result.item ?? null, created: result.created };
}
