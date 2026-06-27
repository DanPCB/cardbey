/**
 * smart_visual — AI promotional graphic creation (DALL-E + stock fallback, LLM copy, canvas composition).
 * Aliases: create_promotion_graphic, generate_promo_image, generate_promotion_asset
 */

import { createPromotionGraphic } from '../../../services/promotionGraphic/promotionGraphicService.js';

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
  const format = typeof input?.format === 'string' ? input.format : '16:9';
  const style = typeof input?.style === 'string' ? input.style : 'modern';
  const mood = typeof input?.mood === 'string' ? input.mood : 'calm';
  const userImageUrl =
    (typeof input?.userImageUrl === 'string' && input.userImageUrl.trim()) ||
    (typeof input?.imageDataUrl === 'string' && input.imageDataUrl.trim()) ||
    '';
  const skipImage = input?.skipImage === true;
  const tenantKey =
    (typeof input?.tenantKey === 'string' && input.tenantKey.trim()) ||
    (typeof context?.tenantId === 'string' && context.tenantId.trim()) ||
    storeId ||
    'default';

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
      description,
      storeId,
      userId,
      format,
      style,
      mood,
      tenantKey,
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

    return {
      status: 'ok',
      output: {
        ok: true,
        ...result,
        graphicUrl: result.graphicUrl,
        instanceId: result.instanceId,
        promotionId: result.promotionId,
        copy: result.copy,
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
