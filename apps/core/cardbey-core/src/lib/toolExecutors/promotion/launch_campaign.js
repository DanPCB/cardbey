/**
 * launch_campaign — proactive runway Step 3 Phase A.
 * Reads Step 2 output (create_promotion), loads Promotion + Content, returns channel picker payload.
 * Phase B: POST /api/performer/proactive-step/confirm with stepKey launch_campaign.
 */

import { getPrismaClient } from '../../../lib/prisma.js';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function firstImageFromElements(elements) {
  if (!Array.isArray(elements)) return null;
  for (const el of elements) {
    if (!el || typeof el !== 'object') continue;
    if (el.type === 'image' && typeof el.src === 'string' && el.src.trim()) return el.src.trim();
  }
  return null;
}

function headlineFromElements(elements) {
  if (!Array.isArray(elements)) return '';
  for (const el of elements) {
    if (!el || typeof el !== 'object') continue;
    if (el.type === 'text' && el.id === 'headline' && typeof el.content === 'string') return el.content.trim();
  }
  for (const el of elements) {
    if (el?.type === 'text' && typeof el.content === 'string' && String(el.content).trim()) {
      return String(el.content).trim();
    }
  }
  return '';
}

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const stepOut = asObject(context?.stepOutputs);
  const co = asObject(stepOut.create_promotion);
  const promotionId =
    typeof co.promotionId === 'string' && co.promotionId.trim()
      ? co.promotionId.trim()
      : typeof input.promotionId === 'string' && input.promotionId.trim()
        ? input.promotionId.trim()
        : '';
  const contentId =
    typeof co.instanceId === 'string' && co.instanceId.trim()
      ? co.instanceId.trim()
      : typeof co.contentId === 'string' && co.contentId.trim()
        ? co.contentId.trim()
        : typeof input.contentId === 'string' && input.contentId.trim()
          ? input.contentId.trim()
          : '';

  if (!promotionId) {
    return {
      status: 'failed',
      error: {
        code: 'PROMOTION_ID_REQUIRED',
        message: 'launch_campaign requires promotionId from Step 2 (create_promotion) output',
      },
    };
  }

  const prisma = getPrismaClient();

  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: promotionId },
    });
    if (!promotion) {
      return {
        status: 'failed',
        error: { code: 'PROMOTION_NOT_FOUND', message: `Promotion not found: ${promotionId}` },
      };
    }

    let content = null;
    if (contentId) {
      content = await prisma.content.findUnique({
        where: { id: contentId },
      });
    }

    const elements = content?.elements != null && Array.isArray(content.elements) ? content.elements : [];
    const settings = asObject(content?.settings);
    const meta = asObject(settings.meta);
    const copy = asObject(meta.copy ?? co.copy);

    const previewImageUrl =
      firstImageFromElements(elements) ||
      (typeof promotion.mediaUrl === 'string' && promotion.mediaUrl.trim() ? promotion.mediaUrl.trim() : null);

    const headline =
      (typeof copy.headline === 'string' && copy.headline.trim() ? copy.headline.trim() : '') ||
      headlineFromElements(elements) ||
      (typeof promotion.title === 'string' ? promotion.title.trim() : '') ||
      'Your campaign';

    const availableChannels = [
      {
        key: 'landing_page',
        label: 'Landing Page + QR Code',
        description: 'A shareable link and printable QR code',
      },
      {
        key: 'whatsapp',
        label: 'WhatsApp Message',
        description: 'Pre-written message the owner can send',
      },
      {
        key: 'social_post',
        label: 'Social Post Draft',
        description: 'Caption and image ready to post',
      },
    ];

    if (process.env.NODE_ENV !== 'production') {
      console.log('[launch_campaign] Phase A: awaiting_channel_selection', { promotionId, contentId });
    }

    return {
      status: 'ok',
      output: {
        phase: 'awaiting_channel_selection',
        approvalStatus: 'awaiting_approval',
        promotionId,
        contentId: contentId || null,
        previewImageUrl,
        headline,
        availableChannels,
        message: 'Choose where to deploy your campaign',
        payload: {
          phase: 'channel_selection',
          promotionId,
          contentId: contentId || null,
          availableChannels,
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[launch_campaign] Phase A error:', message);
    return {
      status: 'failed',
      error: { code: 'LAUNCH_CAMPAIGN_FAILED', message },
    };
  }
}
