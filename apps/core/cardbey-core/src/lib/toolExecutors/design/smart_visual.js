/**
 * smart_visual — AI promotional graphic creation (DALL-E + stock fallback, LLM copy, canvas composition).
 * Aliases: create_promotion_graphic, generate_promo_image, generate_promotion_asset
 *
 * Phase 3: always create a new promotion/content instance; prefer AI-first imagery
 * so stock search does not silently reuse the same first hit as "the" promo graphic.
 * Existing store media may be used only as an optional styleReference (not as output).
 */

import { createPromotionGraphic } from '../../../services/promotionGraphic/promotionGraphicService.js';
import { appendEvent } from '../../missionBlackboard.js';

function pickDescription(input = {}, context = {}) {
  return (
    (typeof input?.prompt === 'string' && input.prompt.trim()) ||
    (typeof input?.description === 'string' && input.description.trim()) ||
    (typeof input?.campaignContext === 'string' && input.campaignContext.trim()) ||
    (typeof context?.rawIntent === 'string' && context.rawIntent.trim()) ||
    (typeof context?.goal === 'string' && context.goal.trim()) ||
    ''
  );
}

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const start = Date.now();
  const description = pickDescription(input, context);
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    '';
  const userId =
    (typeof input?.userId === 'string' && input.userId.trim()) ||
    (typeof context?.userId === 'string' && context.userId.trim()) ||
    (typeof context?.actorId === 'string' && context.actorId.trim()) ||
    '';
  const missionId =
    (typeof input?.missionId === 'string' && input.missionId.trim()) ||
    (typeof context?.missionId === 'string' && context.missionId.trim()) ||
    null;
  const format = typeof input?.format === 'string' ? input.format : '16:9';
  const style = typeof input?.style === 'string' ? input.style : 'modern';
  const mood = typeof input?.mood === 'string' ? input.mood : 'calm';
  const userImageUrl =
    (typeof input?.userImageUrl === 'string' && input.userImageUrl.trim()) ||
    (typeof input?.imageDataUrl === 'string' && input.imageDataUrl.trim()) ||
    (typeof input?.styleReference === 'string' && input.styleReference.trim()) ||
    '';
  const skipImage = input?.skipImage === true;
  const tenantKey =
    (typeof input?.tenantKey === 'string' && input.tenantKey.trim()) ||
    (typeof context?.tenantId === 'string' && context.tenantId.trim()) ||
    storeId ||
    'default';

  // Always generate a new asset unless caller explicitly opts into stock-first.
  const prefer =
    input?.prefer === 'stock-first' || input?.forceStock === true ? 'stock-first' : 'ai-first';

  if (!description) {
    return {
      status: 'failed',
      error: {
        code: 'DESCRIPTION_REQUIRED',
        message: 'Provide a prompt or description for the promotional graphic',
      },
      output: { durationMs: Date.now() - start },
    };
  }

  if (!storeId) {
    return {
      status: 'failed',
      error: {
        code: 'STORE_ID_REQUIRED',
        message: 'smart_visual requires an active storeId',
      },
      output: { durationMs: Date.now() - start },
    };
  }

  if (!userId) {
    return {
      status: 'failed',
      error: {
        code: 'USER_ID_REQUIRED',
        message: 'smart_visual requires userId in context',
      },
      output: { durationMs: Date.now() - start },
    };
  }

  try {
    const result = await createPromotionGraphic({
      description: `${description} [gen:${Date.now()}]`.slice(0, 2000),
      storeId,
      userId,
      format,
      style,
      mood,
      tenantKey,
      imagePrefer: prefer,
      forceNew: true,
      ...(userImageUrl ? { userImageUrl } : {}),
      ...(skipImage ? { skipImage: true } : {}),
    });

    if (result?.phase === 'awaiting_promo_image') {
      return {
        status: 'ok',
        output: {
          ...result,
          durationMs: Date.now() - start,
        },
      };
    }

    if (missionId && result?.graphicUrl) {
      void appendEvent(missionId, 'skill:promotion_asset', {
        type: 'promotion_asset',
        title: result.copy?.headline ?? 'Promotion graphic',
        graphicUrl: result.graphicUrl,
        artifactUrl: result.graphicUrl,
        instanceId: result.instanceId,
        promotionId: result.promotionId,
      }).catch(() => {});
    }

    return {
      status: 'ok',
      type: 'promotion_asset',
      output: {
        ok: true,
        ...result,
        graphicUrl: result.graphicUrl,
        artifactUrl: result.graphicUrl,
        instanceId: result.instanceId,
        promotionId: result.promotionId,
        forceNew: true,
        imagePrefer: prefer,
        durationMs: Date.now() - start,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[smart_visual]', message);
    return {
      status: 'failed',
      error: { code: 'GENERATION_FAILED', message },
      output: { durationMs: Date.now() - start },
    };
  }
}

export default execute;
