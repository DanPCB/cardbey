/**
 * Unified promotional graphic pipeline — stock/AI image, LLM copy, layout, canvas composition.
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { getPrismaClient } from '../../lib/prisma.js';
import { llmGateway } from '../../lib/llm/llmGateway.ts';
import { generateImage, downloadAndSaveImage, isAIAvailable } from '../aiService.js';
import VideoSearchService from '../media/VideoSearchService.js';
import { getStoreProfileForDesign } from '../designStudio/getStoreProfileForDesign.js';

const COPY_SYSTEM_PROMPT = `
You are a marketing copywriter for small businesses.
Generate promotional content for the described campaign or product collection.
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

const MOOD_OVERLAY = {
  energetic: { strength: 0.5, color: 'rgba(0,0,0,0.45)' },
  calm: { strength: 0.35, color: 'rgba(15,23,42,0.4)' },
  bold: { strength: 0.55, color: 'rgba(0,0,0,0.5)' },
  elegant: { strength: 0.4, color: 'rgba(30,27,75,0.45)' },
};

const FORMAT_DIMENSIONS = {
  '9:16': { width: 1080, height: 1920, aspectRatio: 'portrait' },
  '16:9': { width: 1920, height: 1080, aspectRatio: 'landscape' },
  square: { width: 1080, height: 1080, aspectRatio: 'square' },
  '1:1': { width: 1080, height: 1080, aspectRatio: 'square' },
};

function stripJsonFences(raw) {
  let t = String(raw ?? '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return t;
}

function normalizeMood(mood) {
  const m = String(mood ?? 'calm').trim().toLowerCase();
  return MOOD_OVERLAY[m] ? m : 'calm';
}

function resolveFormat(format) {
  const key = String(format ?? '16:9').trim();
  return FORMAT_DIMENSIONS[key] ?? FORMAT_DIMENSIONS['16:9'];
}

function buildImageQuery(intent, content = {}) {
  const parts = [
    String(intent ?? '').trim(),
    content.productName ? String(content.productName).trim() : '',
    content.brandName ? String(content.brandName).trim() : '',
  ].filter(Boolean);
  return parts.join(' ').trim() || 'promotional marketing background';
}

function inferStickers(intent) {
  const lower = String(intent ?? '').toLowerCase();
  const stickers = [];
  if (/\b(sale|discount|off|deal)\b/.test(lower)) {
    stickers.push({ type: 'icon', name: 'mdi:sale', variant: 'badge', position: 'topRight' });
  }
  if (/\b(new|launch|collection|arrival)\b/.test(lower)) {
    stickers.push({ type: 'icon', name: 'mdi:new-box', variant: 'badge', position: 'topLeft' });
  }
  if (/\b(limited|today|now|urgent)\b/.test(lower)) {
    stickers.push({ type: 'icon', name: 'mdi:clock-fast', variant: 'pill', position: 'topRight' });
  }
  return stickers.slice(0, 2);
}

function inferLayoutVariant(intent) {
  const lower = String(intent ?? '').toLowerCase();
  if (/\bminimal|clean|simple\b/.test(lower)) return 'minimal';
  if (/\b(split|side|compare)\b/.test(lower)) return 'split';
  if (/\b(stack|banner|header)\b/.test(lower)) return 'stacked';
  return 'hero';
}

function inferBackgroundMood(mood) {
  const m = normalizeMood(mood);
  return m;
}

export function buildPromoImageCheckpoint(intent) {
  const description = String(intent ?? '').trim();
  return {
    checkpoint: true,
    phase: 'awaiting_promo_image',
    message: "I couldn't find a suitable image for your promotion.",
    prompt:
      'Upload your own image, try a different description in chat, or continue with a brand-color background.',
    description,
    options: [
      { label: 'Upload your own image', action: 'upload_image' },
      { label: 'Try a different description', action: 'retry_prompt' },
      { label: 'Skip image (brand background)', action: 'skip_image' },
    ],
  };
}

async function persistUserImageRef(userImageRef) {
  const raw = String(userImageRef ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('/assets/') || /^https?:\/\//i.test(raw)) return raw;
  const dataMatch = raw.match(/^data:image\/([\w+.-]+);base64,(.+)$/i);
  if (!dataMatch) return null;
  const extRaw = dataMatch[1].toLowerCase().replace('jpeg', 'jpg');
  const ext = extRaw === 'svg+xml' ? 'svg' : extRaw;
  const buffer = Buffer.from(dataMatch[2], 'base64');
  const assetsDir = path.join(process.cwd(), 'public', 'assets', 'promo-graphics');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  const filename = `user-upload-${Date.now()}.${ext}`;
  const filePath = path.join(assetsDir, filename);
  await fs.promises.writeFile(filePath, buffer);
  return `/assets/promo-graphics/${filename}`;
}

async function mirrorRemoteImage(remoteUrl, folder = 'promo-graphics') {
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const assetsDir = path.join(process.cwd(), 'public', 'assets', folder);
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  const filename = `promo-${Date.now()}.png`;
  const filePath = path.join(assetsDir, filename);
  await fs.promises.writeFile(filePath, buffer);
  return `/assets/${folder}/${filename}`;
}

/**
 * Stock-first image resolution with optional DALL-E fallback.
 */
export async function resolvePromoImage({
  intent,
  mood = 'calm',
  format = '16:9',
  content = {},
  policy = {},
  userImageUrl = null,
  skipPlaceholder = false,
}) {
  const prefer = policy?.prefer === 'ai-first' ? 'ai-first' : 'stock-first';
  const allowAi = policy?.allowAi !== false;
  const query = buildImageQuery(intent, content);
  const dims = resolveFormat(format);
  const overlayMood = normalizeMood(mood);

  let source = 'stock';
  let url = null;
  let attribution = null;

  const persistedUserImage = userImageUrl ? await persistUserImageRef(userImageUrl) : null;
  if (persistedUserImage) {
    return {
      background: {
        source: 'user_uploaded',
        url: persistedUserImage,
        thumb: persistedUserImage,
        attribution: { source: 'user', licenseNote: 'Uploaded by user' },
      },
      overlay: MOOD_OVERLAY[overlayMood],
      stickers: inferStickers(intent),
    };
  }

  if (skipPlaceholder) {
    return {
      background: {
        source: 'placeholder',
        url: null,
        usePlaceholder: true,
        thumb: null,
        attribution: { source: 'placeholder', licenseNote: 'Brand color background' },
      },
      overlay: MOOD_OVERLAY[overlayMood],
      stickers: inferStickers(intent),
    };
  }

  if (prefer === 'stock-first') {
    const searchResult = await VideoSearchService.searchAllSources(query, { perPage: 6 });
    const results = Array.isArray(searchResult?.results) ? searchResult.results : [];
    const photo = results.find((r) => r?.url || r?.previewUrl);
    if (photo) {
      url = photo.url ?? photo.previewUrl ?? null;
      attribution = {
        photographer: photo.photographer ?? photo.user ?? undefined,
        photographerUrl: photo.photographerUrl ?? undefined,
        sourcePageUrl: photo.sourcePageUrl ?? photo.pageUrl ?? undefined,
        licenseNote: photo.license ?? 'Stock media',
        source: photo.source ?? 'stock',
      };
    }
  }

  if (!url && allowAi && isAIAvailable()) {
    try {
      const imageResult = await generateImage({
        prompt: `${query}. Promotional background, leave space for headline text, no baked-in text.`,
        style: 'poster',
        aspectRatio: dims.aspectRatio,
      });
      if (imageResult?.url) {
        url = await mirrorRemoteImage(imageResult.url);
        source = 'ai';
        attribution = { source: 'openai', licenseNote: 'AI-generated (DALL-E 3)' };
      }
    } catch (err) {
      console.warn('[promotionGraphic] AI image fallback failed:', err?.message ?? err);
    }
  }

  if (!url && prefer === 'ai-first' && allowAi && isAIAvailable()) {
    try {
      const imageResult = await generateImage({
        prompt: `${query}. Promotional background, leave space for headline text, no baked-in text.`,
        style: 'poster',
        aspectRatio: dims.aspectRatio,
      });
      if (imageResult?.url) {
        url = await mirrorRemoteImage(imageResult.url);
        source = 'ai';
        attribution = { source: 'openai', licenseNote: 'AI-generated (DALL-E 3)' };
      }
    } catch (err) {
      console.warn('[promotionGraphic] AI image generation failed:', err?.message ?? err);
    }
  }

  if (!url) {
    return buildPromoImageCheckpoint(intent);
  }

  return {
    background: {
      source,
      url,
      thumb: url,
      attribution,
    },
    overlay: MOOD_OVERLAY[overlayMood],
    stickers: inferStickers(intent),
  };
}

/**
 * LLM promotional copy for Content Studio / API.
 */
export async function generatePromoCopy({
  intent,
  mood = 'calm',
  content = {},
  storeId,
  tenantKey = 'default',
}) {
  const storeProfile = storeId ? await getStoreProfileForDesign(storeId) : null;
  const brandName = content.brandName || content.brand || storeProfile?.name || '';
  const productName = content.productName || '';
  const headlineSeed = content.headline || '';
  const subSeed = content.subheadline || '';

  const fallback = {
    headline: headlineSeed || productName || brandName || 'Special Offer',
    subheadline: subSeed || 'Discover something new today',
    bodyText: content.bodyText || '',
    ctaText: content.ctaText || content.cta || 'Shop now',
    tone: normalizeMood(mood),
  };

  const userPrompt = `${COPY_SYSTEM_PROMPT}

Campaign intent: ${String(intent ?? '').trim() || 'promotion'}
Mood: ${mood}
Brand: ${brandName || 'local business'}
Product/collection: ${productName || 'general promotion'}
Existing headline (refine if present): ${headlineSeed || 'none'}
Existing subheadline (refine if present): ${subSeed || 'none'}`.trim();

  try {
    const llmResult = await llmGateway.generate({
      purpose: 'promotion_graphic_copy',
      prompt: userPrompt,
      tenantKey,
      maxTokens: 300,
      temperature: 0.7,
      responseFormat: 'json',
    });
    const raw = stripJsonFences(llmResult?.text ?? '');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.headline === 'string' && parsed.headline.trim()) {
      return { ...fallback, ...parsed };
    }
  } catch (err) {
    console.warn('[promotionGraphic] copy LLM failed:', err?.message ?? err);
  }

  return fallback;
}

/**
 * Deterministic layout spec for Content Studio promotion template.
 */
export function generatePromoLayout({ intent, content = {}, format = '16:9', mood = 'calm' }) {
  const variant = inferLayoutVariant(intent);
  const overlayMood = normalizeMood(mood);
  const isPortrait = String(format).includes('9:16');

  const titleY = isPortrait ? 0.62 : 0.55;
  const subtitleY = isPortrait ? 0.72 : 0.68;
  const ctaY = isPortrait ? 0.82 : 0.78;

  return {
    layout: variant,
    background: {
      type: 'photo',
      mood: inferBackgroundMood(mood),
    },
    text: {
      title: {
        x: 0.5,
        y: titleY,
        size: isPortrait ? 56 : 64,
        weight: 'bold',
        align: 'center',
      },
      subtitle: {
        x: 0.5,
        y: subtitleY,
        size: isPortrait ? 32 : 36,
        weight: 'regular',
        align: 'center',
      },
      cta: {
        x: 0.5,
        y: ctaY,
        size: 28,
        weight: 'bold',
        align: 'center',
      },
    },
    visuals: {
      imageFocus: variant === 'split' ? 'left' : 'center',
      overlayStrength: MOOD_OVERLAY[overlayMood].strength,
    },
    contentHints: {
      headline: content.headline ?? '',
      subheadline: content.subheadline ?? '',
      cta: content.cta ?? content.ctaText ?? 'Shop now',
    },
  };
}

/**
 * Build Content Studio canvas elements (promotion graphic).
 */
export function composeGraphicElements({
  imageUrl,
  copy,
  brand = {},
  format = '16:9',
  usePlaceholderBackground = false,
}) {
  const dims = resolveFormat(format);
  const { width, height } = dims;
  const primaryColor = brand.primaryColor || '#5B4FCF';
  const logoUrl = brand.logoUrl || null;

  const elements = [];
  if (usePlaceholderBackground || !imageUrl) {
    elements.push({
      id: 'bg-fill',
      type: 'rect',
      x: 0,
      y: 0,
      width,
      height,
      fill: primaryColor,
      zIndex: 0,
    });
  } else {
    elements.push({
      id: 'bg-image',
      type: 'image',
      src: imageUrl,
      x: 0,
      y: 0,
      width,
      height,
      objectFit: 'cover',
      zIndex: 0,
    });
  }

  elements.push(
    {
      id: 'overlay',
      type: 'rect',
      x: 0,
      y: Math.round(height * 0.45),
      width,
      height: Math.round(height * 0.55),
      fill: 'rgba(0,0,0,0.45)',
      zIndex: 1,
    },
  );

  if (logoUrl) {
    elements.push({
      id: 'logo',
      type: 'image',
      src: logoUrl,
      x: 40,
      y: 40,
      width: 120,
      height: 120,
      objectFit: 'contain',
      zIndex: 4,
    });
  }

  const textBaseY = Math.round(height * (dims.aspectRatio === 'portrait' ? 0.62 : 0.55));

  elements.push(
    {
      id: 'headline',
      type: 'text',
      content: copy.headline,
      x: 48,
      y: textBaseY,
      width: width - 96,
      fontSize: dims.aspectRatio === 'portrait' ? 56 : 64,
      fontWeight: 'bold',
      color: '#ffffff',
      align: 'center',
      zIndex: 2,
    },
    {
      id: 'subheadline',
      type: 'text',
      content: copy.subheadline,
      x: 48,
      y: textBaseY + (dims.aspectRatio === 'portrait' ? 100 : 90),
      width: width - 96,
      fontSize: dims.aspectRatio === 'portrait' ? 32 : 36,
      fontWeight: 'normal',
      color: '#f1f5f9',
      align: 'center',
      zIndex: 2,
    },
    {
      id: 'cta',
      type: 'button',
      content: copy.ctaText || copy.cta || 'Shop now',
      x: Math.round((width - 300) / 2),
      y: textBaseY + (dims.aspectRatio === 'portrait' ? 220 : 200),
      width: 300,
      height: 72,
      backgroundColor: primaryColor,
      color: '#ffffff',
      fontSize: 28,
      borderRadius: 36,
      zIndex: 3,
    },
  );

  return { elements, width, height };
}

async function ensureUserExists(userId, displayName = 'Guest') {
  const prisma = getPrismaClient();
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }).catch(() => null);
  if (existing) return;
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `guest-${userId}@cardbey.guest`,
      passwordHash: 'guest-placeholder-no-login',
      displayName,
    },
  });
}

/**
 * Full pipeline: image + copy + composition + DB records.
 */
export async function createPromotionGraphic({
  description,
  storeId,
  userId,
  format = '16:9',
  style = 'modern',
  mood = 'calm',
  tenantKey = 'default',
  userImageUrl = null,
  imageDataUrl = null,
  skipImage = false,
  imagePrefer = 'ai-first',
  forceNew = true,
}) {
  const prompt = String(description ?? '').trim();
  if (!prompt) {
    throw new Error('description is required');
  }
  if (!storeId) {
    throw new Error('storeId is required');
  }
  if (!userId) {
    throw new Error('userId is required');
  }

  const storeProfile = await getStoreProfileForDesign(storeId);
  if (!storeProfile) {
    throw new Error('Store not found');
  }

  const content = {
    brandName: storeProfile.name,
    productName: '',
  };

  const uploadedImage = userImageUrl || imageDataUrl;
  const prefer = imagePrefer === 'stock-first' ? 'stock-first' : 'ai-first';
  const imageResult = await resolvePromoImage({
    intent: forceNew ? `${prompt} unique promotional composition` : prompt,
    mood,
    format,
    content,
    policy: { prefer, allowAi: true },
    userImageUrl: uploadedImage,
    skipPlaceholder: skipImage === true,
  });

  if (imageResult?.checkpoint === true || imageResult?.phase === 'awaiting_promo_image') {
    return {
      ok: false,
      phase: 'awaiting_promo_image',
      checkpoint: 'upload_image',
      tool: 'create_promotion_graphic',
      storeId,
      description: prompt,
      message: imageResult.message ?? buildPromoImageCheckpoint(prompt).message,
      prompt: imageResult.prompt ?? buildPromoImageCheckpoint(prompt).prompt,
      options: Array.isArray(imageResult.options) ? imageResult.options : buildPromoImageCheckpoint(prompt).options,
    };
  }

  const copy = await generatePromoCopy({
    intent: prompt,
    mood,
    content,
    storeId,
    tenantKey,
  });

  const layout = generatePromoLayout({ intent: prompt, content: copy, format, mood });

  const usePlaceholderBackground =
    imageResult.background?.usePlaceholder === true || !imageResult.background?.url;
  const { elements, width, height } = composeGraphicElements({
    imageUrl: imageResult.background?.url ?? null,
    copy,
    brand: storeProfile,
    format,
    usePlaceholderBackground,
  });

  await ensureUserExists(userId);

  const prisma = getPrismaClient();
  const now = new Date();
  const endAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const promotion = await prisma.promotion.create({
    data: {
      storeId,
      type: 'banner',
      title: copy.headline,
      message: copy.bodyText || copy.subheadline,
      ctaLabel: copy.ctaText || 'Shop now',
      status: 'draft',
      startAt: now,
      endAt,
      mediaUrl: imageResult.background?.url ?? null,
      mediaType: 'image',
      metadataJson: {
        generatedBy: 'smart_visual',
        style,
        format,
        copy,
        imageSource: imageResult.background.source,
      },
    },
  });

  const contentRecord = await prisma.content.create({
    data: {
      name: `${copy.headline} — Promo Graphic`,
      userId,
      elements,
      settings: {
        width,
        height,
        background: '#000000',
        promotionId: promotion.id,
        storeId,
        type: 'promotion',
        templateKey: 'promotion_graphic_v1',
        meta: {
          templateId: 'promotion',
          generatedBy: 'smart_visual',
          layout,
          copy,
          style,
        },
      },
      version: 1,
    },
  });

  await prisma.promotion.update({
    where: { id: promotion.id },
    data: {
      metadataJson: {
        ...(promotion.metadataJson && typeof promotion.metadataJson === 'object' ? promotion.metadataJson : {}),
        contentInstanceId: contentRecord.id,
      },
    },
  });

  return {
    promotionId: promotion.id,
    instanceId: contentRecord.id,
    graphicUrl: imageResult.background?.url ?? null,
    imageSource: imageResult.background.source,
    copy,
    layout,
    elements,
    width,
    height,
    actions: [
      { label: 'Open in Studio', action: 'open_studio', instanceId: contentRecord.id },
      { label: 'Publish to Store', action: 'publish_to_store', promotionId: promotion.id },
      { label: 'Share to Social', action: 'share_to_social', promotionId: promotion.id },
    ],
    message: 'Promotional graphic created successfully',
  };
}

/**
 * Generate standalone element images (Contents Studio AI Assist).
 */
export async function generateElementImages({ prompt, style = 'photo', aspectRatio = 'landscape' }) {
  if (!isAIAvailable()) {
    throw new Error('AI service is not available. Please configure OPENAI_API_KEY.');
  }
  const imageResult = await generateImage({ prompt, style, aspectRatio });
  const filename = `ai-element-${Date.now()}`;
  const saved = await downloadAndSaveImage(imageResult.url, filename);
  return {
    url: saved.url,
    thumb: saved.url,
    prompt: imageResult.prompt,
  };
}
