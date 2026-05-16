/**
 * Phase B: generate promotional copy and pre-populate Content Studio canvas for a selected product.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { llmGateway } from '../lib/llm/llmGateway.ts';

const COPY_SYSTEM_PROMPT = `
You are a marketing copywriter for small businesses.
Generate promotional content for a product.
Return ONLY valid JSON in this exact shape:
{
  "headline": "short punchy headline (max 8 words)",
  "subheadline": "supporting text (max 15 words)",
  "bodyText": "1-2 sentence description (max 30 words)",
  "ctaText": "call to action button text (max 4 words)",
  "tone": "friendly|urgent|elegant|playful"
}
No preamble, no markdown, no explanation. JSON only.
`.trim();

function stripJsonFences(raw) {
  let t = String(raw ?? '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return t;
}

/**
 * @param {object} params
 * @param {string} params.storeId
 * @param {string} params.userId
 * @param {object} params.product - { productId, name, price, category, imageUrl }
 * @param {object} params.marketReport - from Step 1
 * @param {string} params.tenantKey
 * @param {string} [params.ownerEditedPrompt]
 * @param {string} [params.priorStepsContext] — runway blackboard chain for copy continuity
 * @returns {Promise<{ instanceId: string, promotionId: string, copy: object, product: object }>}
 */
export async function generatePromotionContent({
  storeId,
  userId,
  product,
  marketReport,
  tenantKey = 'default',
  ownerEditedPrompt,
  priorStepsContext,
}) {
  const prisma = getPrismaClient();

  const pid = product?.productId != null ? String(product.productId).trim() : '';
  const isUploaded = !!product?.isUploaded;
  if (!pid && !isUploaded) {
    throw new Error('productId is required');
  }
  const fullProduct = pid
    ? await prisma.product
        .findFirst({
          where: { id: pid, businessId: storeId, deletedAt: null },
          select: {
            id: true,
            name: true,
            price: true,
            category: true,
            imageUrl: true,
            images: true,
            description: true,
          },
        })
        .catch(() => null)
    : null;

  if (!fullProduct && !isUploaded) {
    throw new Error('Product not found for this store');
  }

  let imageUrl = product?.imageUrl ?? fullProduct?.imageUrl ?? null;
  if (!imageUrl && Array.isArray(fullProduct?.images) && fullProduct.images.length) {
    const first = fullProduct.images[0];
    imageUrl = typeof first === 'string' ? first : first?.url ?? null;
  }

  const name = String(product?.name || fullProduct?.name || 'Product');
  const price = product?.price != null ? product.price : fullProduct?.price ?? null;
  const category = product?.category ?? fullProduct?.category ?? null;
  const description = fullProduct?.description ?? '';

  const priorBlock =
    typeof priorStepsContext === 'string' && priorStepsContext.trim()
      ? `\nMission continuity (earlier steps):\n${priorStepsContext.trim().slice(0, 6000)}\n`
      : '';

  const userPrompt = `${COPY_SYSTEM_PROMPT}

Task data:
Store: ${storeId}
Product: ${name}
Price: ${price != null ? `$${price}` : 'not specified'}
Category: ${category ?? 'general'}
Target audience: ${String(marketReport?.summary ?? marketReport?.targetAudience ?? '').slice(0, 200) || 'general customers'}
Campaign goal: increase sales of this product
${priorBlock}${ownerEditedPrompt ? `Owner creative direction: ${ownerEditedPrompt}` : ''}`.trim();

  let copy = {
    headline: name,
    subheadline: 'Now available in store',
    bodyText: description || '',
    ctaText: 'Shop now',
    tone: 'friendly',
  };

  try {
    const llmResult = await llmGateway.generate({
      purpose: 'promotion_copy_generation',
      prompt: userPrompt,
      model: process.env.AGENT_LLM_MODEL ?? undefined,
      provider: process.env.AGENT_LLM_PROVIDER ?? undefined,
      tenantKey,
      maxTokens: 300,
      temperature: 0.7,
      responseFormat: 'json',
    });

    const raw = stripJsonFences(llmResult?.text ?? '');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.headline === 'string' && parsed.headline.trim()) {
      copy = { ...copy, ...parsed };
    }
  } catch (err) {
    console.warn('[promotionContentGenerator] copy LLM failed:', err?.message ?? err);
  }

  const elements = [];

  elements.push({
    id: 'bg',
    type: 'rect',
    x: 0,
    y: 0,
    width: 1080,
    height: 1080,
    fill: '#ffffff',
    zIndex: 0,
  });

  if (imageUrl) {
    elements.push({
      id: 'product-image',
      type: 'image',
      src: imageUrl,
      x: 40,
      y: 40,
      width: 1000,
      height: 600,
      objectFit: 'cover',
      zIndex: 1,
    });
  }

  elements.push({
    id: 'headline',
    type: 'text',
    content: copy.headline,
    x: 40,
    y: imageUrl ? 680 : 200,
    width: 1000,
    fontSize: 72,
    fontWeight: 'bold',
    color: '#1a1a1a',
    zIndex: 2,
  });

  elements.push({
    id: 'subheadline',
    type: 'text',
    content: copy.subheadline,
    x: 40,
    y: imageUrl ? 780 : 320,
    width: 1000,
    fontSize: 40,
    fontWeight: 'normal',
    color: '#444444',
    zIndex: 2,
  });

  elements.push({
    id: 'cta',
    type: 'button',
    content: copy.ctaText,
    x: 40,
    y: imageUrl ? 880 : 500,
    width: 280,
    height: 80,
    backgroundColor: '#5B4FCF',
    color: '#ffffff',
    fontSize: 32,
    borderRadius: 8,
    zIndex: 3,
  });

  const existingUser = await prisma.user
    .findUnique({ where: { id: userId }, select: { id: true } })
    .catch(() => null);
  if (!existingUser) {
    const guestEmail = `guest-${userId}@cardbey.guest`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: guestEmail,
        passwordHash: 'guest-placeholder-no-login',
        displayName: 'Guest',
      },
    });
  }

  const now = new Date();
  const endAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const promotion = await prisma.promotion.create({
    data: {
      storeId,
      type: 'banner',
      title: copy.headline,
      message: copy.bodyText,
      ctaLabel: copy.ctaText,
      status: 'draft',
      startAt: now,
      endAt,
      metadataJson: {
        productId: fullProduct?.id ?? pid,
        copy,
        generatedBy: 'campaign_runway_step2',
      },
    },
  });

  const content = await prisma.content.create({
    data: {
      name: `${copy.headline} — Promotion`,
      userId,
      elements,
      settings: {
        width: 1080,
        height: 1080,
        background: '#ffffff',
        promotionId: promotion.id,
        storeId,
        productId: fullProduct?.id ?? pid,
        type: 'promotion',
        templateKey: 'campaign_runway',
        meta: {
          templateId: 'promotion',
          generatedBy: 'campaign_runway',
          copy,
        },
      },
      version: 1,
    },
  });

  const prevMeta =
    promotion.metadataJson && typeof promotion.metadataJson === 'object' && !Array.isArray(promotion.metadataJson)
      ? promotion.metadataJson
      : {};
  await prisma.promotion.update({
    where: { id: promotion.id },
    data: {
      metadataJson: {
        ...prevMeta,
        contentInstanceId: content.id,
      },
    },
  });

  return {
    instanceId: content.id,
    promotionId: promotion.id,
    copy,
    product: {
      productId: fullProduct?.id ?? pid,
      name,
      price,
      category,
      imageUrl,
    },
  };
}
