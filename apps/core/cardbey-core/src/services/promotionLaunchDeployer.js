/**
 * Phase B: deploy launch_campaign channels (landing page + QR, WhatsApp link, social caption).
 * Persists publicId, landingPageUrl, qrCodeDataUrl on Promotion.metadataJson (no extra Prisma columns).
 */

import { nanoid } from 'nanoid';
import { llmGateway } from '../lib/llm/llmGateway.ts';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * Headline, body, hero image, CTA — same rules as launch deploy (Content canvas + Promotion row).
 * Used by GET /api/promotions/public/:publicId.
 * @param {import('@prisma/client').Promotion} promotion
 * @param {import('@prisma/client').Content | null} [content]
 */
export function resolveLandingPageContentFields(promotion, content) {
  const elements = content?.elements != null && Array.isArray(content.elements) ? content.elements : [];
  const settings = asObject(content?.settings);
  const copy = asObject(asObject(settings.meta).copy);
  let productImageUrl = null;
  for (const el of elements) {
    if (el?.type === 'image' && typeof el.src === 'string' && el.src.trim()) {
      productImageUrl = el.src.trim();
      break;
    }
  }
  if (!productImageUrl && promotion?.mediaUrl) productImageUrl = String(promotion.mediaUrl);
  const bodyText =
    (typeof copy.bodyText === 'string' && copy.bodyText.trim() ? copy.bodyText.trim() : '') ||
    (typeof promotion?.message === 'string' ? promotion.message.trim() : '') ||
    '';
  const headline =
    (typeof copy.headline === 'string' && copy.headline.trim() ? copy.headline.trim() : '') ||
    (typeof promotion?.title === 'string' ? promotion.title.trim() : '') ||
    'Check out our offer';
  const ctaText =
    (typeof promotion?.ctaLabel === 'string' && promotion.ctaLabel.trim() ? promotion.ctaLabel.trim() : '') ||
    'Learn more';
  const ctaUrl = typeof promotion?.ctaUrl === 'string' && promotion.ctaUrl.trim() ? promotion.ctaUrl.trim() : '';
  return { headline, bodyText, productImageUrl, ctaText, ctaUrl };
}

function publicBaseUrl() {
  return String(process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5174').replace(
    /\/$/,
    '',
  );
}

/**
 * Ensure Promotion has publicId, landingPageUrl, qrCodeDataUrl in metadataJson.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} promotionId
 */
export async function ensureLandingPageAndQr(prisma, promotionId) {
  const promotion = await prisma.promotion.findUnique({ where: { id: promotionId } });
  if (!promotion) throw new Error('Promotion not found');

  const meta = asObject(promotion.metadataJson);
  let publicId = typeof meta.publicId === 'string' && meta.publicId.trim() ? meta.publicId.trim() : nanoid(12);
  const base = publicBaseUrl();
  /** Default path: /q/:storeSlug/promo/:publicId when Business.slug exists (matches dashboard route); else /promo/:publicId. API still resolves by publicId only. */
  let defaultPath = `/promo/${publicId}`;
  if (promotion.storeId) {
    const business = await prisma.business
      .findUnique({ where: { id: promotion.storeId }, select: { slug: true } })
      .catch(() => null);
    const slug = business?.slug && String(business.slug).trim();
    if (slug) {
      defaultPath = `/q/${encodeURIComponent(slug)}/promo/${publicId}`;
    }
  }
  const landingPageUrl =
    typeof meta.landingPageUrl === 'string' && meta.landingPageUrl.trim()
      ? meta.landingPageUrl.trim()
      : `${base}${defaultPath}`;

  let qrCodeDataUrl = typeof meta.qrCodeDataUrl === 'string' && meta.qrCodeDataUrl.trim() ? meta.qrCodeDataUrl : null;
  if (!qrCodeDataUrl) {
    const QRCode = await import('qrcode');
    qrCodeDataUrl = await QRCode.toDataURL(landingPageUrl, { width: 256, margin: 1 });
  }

  const nextMeta = { ...meta, publicId, landingPageUrl, qrCodeDataUrl };
  await prisma.promotion.update({
    where: { id: promotionId },
    data: { metadataJson: nextMeta },
  });

  return { publicId, landingPageUrl, qrCodeDataUrl, headline: promotion.title };
}

/**
 * @param {object} opts
 * @param {import('@prisma/client').PrismaClient} opts.prisma
 * @param {string} opts.promotionId
 * @param {string[]} opts.selectedChannels
 * @param {string} [opts.tenantKey]
 * @param {string} [opts.contentId] — Content row id (from Step 2); overrides metadataJson.contentInstanceId
 */
export async function deployLaunchCampaignChannels({
  prisma,
  promotionId,
  selectedChannels,
  tenantKey = 'default',
  contentId: contentIdOverride,
}) {
  const channels = Array.isArray(selectedChannels)
    ? [...new Set(selectedChannels.map((c) => String(c || '').trim()).filter(Boolean))]
    : [];

  if (!promotionId || !channels.length) {
    throw new Error('promotionId and selectedChannels are required');
  }

  const promotion = await prisma.promotion.findUnique({ where: { id: promotionId } });
  if (!promotion) throw new Error('Promotion not found');

  const meta = asObject(promotion.metadataJson);
  const contentId =
    typeof contentIdOverride === 'string' && contentIdOverride.trim()
      ? contentIdOverride.trim()
      : typeof meta.contentInstanceId === 'string'
        ? meta.contentInstanceId
        : null;
  let content = null;
  if (contentId) {
    content = await prisma.content.findUnique({ where: { id: contentId } }).catch(() => null);
  }

  const { headline, bodyText, productImageUrl: previewImageUrl } = resolveLandingPageContentFields(
    promotion,
    content,
  );

  const results = [];

  const ordered = [...channels].sort((a, b) => {
    if (a === 'landing_page') return -1;
    if (b === 'landing_page') return 1;
    return 0;
  });

  let landingPageUrl = typeof meta.landingPageUrl === 'string' ? meta.landingPageUrl : null;
  let qrCodeDataUrl = typeof meta.qrCodeDataUrl === 'string' ? meta.qrCodeDataUrl : null;

  for (const key of ordered) {
    if (key === 'landing_page') {
      const land = await ensureLandingPageAndQr(prisma, promotionId);
      landingPageUrl = land.landingPageUrl;
      qrCodeDataUrl = land.qrCodeDataUrl;
      results.push({
        channel: 'landing_page',
        landingPageUrl: land.landingPageUrl,
        qrCodeDataUrl: land.qrCodeDataUrl,
        publicId: land.publicId,
      });
    } else if (key === 'whatsapp') {
      if (!landingPageUrl) {
        const land = await ensureLandingPageAndQr(prisma, promotionId);
        landingPageUrl = land.landingPageUrl;
        qrCodeDataUrl = land.qrCodeDataUrl;
      }
      const message = `${headline}\n\nCheck it out: ${landingPageUrl}`;
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
      results.push({
        channel: 'whatsapp',
        whatsappUrl,
        messagePreview: message,
      });
    } else if (key === 'social_post') {
      let caption = `${headline}${bodyText ? ` — ${bodyText.slice(0, 120)}` : ''}`.slice(0, 280);
      try {
        const prompt = `Write ONE social media caption (max 280 chars). Use 1-2 relevant emojis. End with a short CTA.
Headline: ${headline}
Body: ${bodyText || '(none)'}
Return plain text only, no quotes.`;
        const llmResult = await llmGateway.generate({
          purpose: 'launch_campaign_social_caption',
          prompt,
          model: process.env.AGENT_LLM_MODEL ?? undefined,
          provider: process.env.AGENT_LLM_PROVIDER ?? undefined,
          tenantKey,
          maxTokens: 200,
          temperature: 0.75,
          responseFormat: 'text',
        });
        const t = String(llmResult?.text ?? '').trim().replace(/^["']|["']$/g, '');
        if (t) caption = t.slice(0, 280);
      } catch (e) {
        console.warn('[promotionLaunchDeployer] social LLM failed:', e?.message ?? e);
      }
      results.push({
        channel: 'social_post',
        caption,
        imageUrl: previewImageUrl,
      });
    }
  }

  const fresh = await prisma.promotion.findUnique({ where: { id: promotionId } });
  const mergedMeta = { ...asObject(fresh?.metadataJson), lastDeployChannels: channels, deployedAt: new Date().toISOString() };

  await prisma.promotion.update({
    where: { id: promotionId },
    data: {
      status: 'active',
      metadataJson: mergedMeta,
    },
  });

  const deployedAt = new Date().toISOString();

  return {
    phase: 'deployed',
    promotionId,
    channels: results,
    deployedAt,
  };
}
