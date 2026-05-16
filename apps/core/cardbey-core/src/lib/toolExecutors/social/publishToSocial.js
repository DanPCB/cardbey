/**
 * publish_to_social — Method C (share links) + Method B (Facebook Graph when connected).
 * External Connections / push — channel keys align with lib/externalConnections (PUSH_SHARE_CHANNEL_KEYS).
 */

import { getPrismaClient } from '../../prisma.js';
import { decryptToken } from '../../tokenCrypto.js';
import { llmGateway } from '../../llm/llmGateway.ts';
import {
  PUSH_SHARE_CHANNEL_KEYS,
  normalizePublishChannelKey,
} from '../../externalConnections/capabilities.js';

const SHARE_URL_BUILDERS = {
  facebook: ({ url, caption }) =>
    `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(caption)}`,
  instagram: () => null,
  zalo: ({ url, caption }) => `https://zalo.me/share?url=${enc(url)}&title=${enc(caption)}`,
  whatsapp: ({ url, caption }) => `https://wa.me/?text=${enc(`${caption} ${url}`.trim())}`,
  telegram: ({ url, caption }) => `https://t.me/share/url?url=${enc(url)}&text=${enc(caption)}`,
  twitter: ({ url, caption }) => `https://twitter.com/intent/tweet?text=${enc(caption)}&url=${enc(url)}`,
  email: ({ url, caption, title }) =>
    `mailto:?subject=${enc(title)}&body=${enc(`${caption}\n\n${url}`)}`,
};

function enc(str) {
  return encodeURIComponent(str ?? '');
}

function promoMeta(promotion) {
  if (!promotion?.metadataJson || typeof promotion.metadataJson !== 'object' || Array.isArray(promotion.metadataJson)) {
    return {};
  }
  return promotion.metadataJson;
}

async function generateSocialCaption({ promotion, platform }) {
  const platformStyle = {
    facebook: 'conversational, 2-3 sentences, end with the link',
    instagram: 'punchy, emoji-rich, 5-10 relevant hashtags at the end',
    zalo: 'warm and friendly Vietnamese tone, concise, 1-2 sentences',
    whatsapp: 'brief, personal, like texting a friend',
    telegram: 'concise, clear, include the link',
    twitter: 'under 240 chars, punchy, 2-3 hashtags',
    email: 'professional subject line + 2-3 sentence body',
    default: 'concise, engaging, include a call to action',
  };

  const style = platformStyle[platform] ?? platformStyle.default;
  const title = promotion?.title ?? 'Our latest promotion';
  const message = promotion?.message ?? '';
  const meta = promoMeta(promotion);
  const price = meta?.price != null ? String(meta.price) : '';

  const prompt = `Write a social media post for ${platform}.
Style: ${style}

Promotion details:
Title: ${title}
${message ? `Description: ${message}` : ''}
${price ? `Price: ${price}` : ''}

Return ONLY valid JSON: { "caption": "...", "hashtags": ["...", "..."] }
No markdown. No explanation.`;

  try {
    const { text: raw } = await llmGateway.generate({
      purpose: 'social_caption_generation',
      prompt,
      tenantKey: 'publish-to-social',
      maxTokens: 300,
      temperature: 0.7,
      responseFormat: 'json',
    });
    const clean = String(raw ?? '')
      .replace(/```json|```/g, '')
      .trim();
    return JSON.parse(clean);
  } catch {
    return {
      caption: `${title}${message ? ` — ${message}` : ''}`,
      hashtags: ['promotion', 'sale', 'cardbey'],
    };
  }
}

async function postToFacebookPage({ connection, caption, campaignUrl }) {
  const token = decryptToken(connection.accessToken);
  const pageId = connection.pageId;
  if (!pageId) throw new Error('Missing Facebook page id on connection');

  const body = {
    message: caption + (campaignUrl ? `\n\n${campaignUrl}` : ''),
    ...(campaignUrl ? { link: campaignUrl } : {}),
    access_token: token,
  };

  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Graph API error ${res.status}`);
  }

  return {
    postId: data.id,
    postUrl: `https://www.facebook.com/${data.id}`,
  };
}

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const platforms = Array.isArray(input.platforms) ? input.platforms.map((p) => String(p || '').toLowerCase()) : [];
  const storeId = String(input.storeId ?? context.storeId ?? '').trim();
  const userId = String(input.userId ?? context.userId ?? '').trim();
  const promotionId = typeof input.promotionId === 'string' ? input.promotionId.trim() : '';
  const campaignUrlIn = typeof input.campaignUrl === 'string' ? input.campaignUrl.trim() : '';
  const providedCaption = typeof input.caption === 'string' ? input.caption.trim() : '';
  const postMode = String(input.postMode ?? 'share_link').trim().toLowerCase() || 'share_link';

  if (!storeId || !userId) {
    return {
      status: 'ok',
      output: { ok: false, error: 'missing_store_or_user' },
    };
  }

  const targetPlatforms = platforms.includes('all')
    ? [...PUSH_SHARE_CHANNEL_KEYS]
    : platforms
        .map((x) => normalizePublishChannelKey(x) || String(x ?? '').trim().toLowerCase())
        .filter(Boolean);

  if (!targetPlatforms.length) {
    return {
      status: 'ok',
      output: { ok: false, error: 'no_platforms_specified' },
    };
  }

  const prisma = getPrismaClient();

  const promotion = promotionId
    ? await prisma.promotion.findFirst({ where: { id: promotionId, storeId } })
    : await prisma.promotion.findFirst({ where: { storeId }, orderBy: { createdAt: 'desc' } });

  const meta = promoMeta(promotion);
  const resolvedCampaignUrl =
    campaignUrlIn || (typeof meta.landingPageUrl === 'string' ? meta.landingPageUrl.trim() : '') || null;

  const connections = await prisma.oAuthConnection.findMany({
    where: { userId, platform: { in: targetPlatforms } },
  });
  const connectionMap = Object.fromEntries(connections.map((c) => [c.platform, c]));

  const results = await Promise.allSettled(
    targetPlatforms.map(async (platform) => {
      const { caption, hashtags } = providedCaption
        ? { caption: providedCaption, hashtags: [] }
        : await generateSocialCaption({ promotion, platform });

      const fullCaption = hashtags?.length ? `${caption}\n\n${hashtags.map((h) => `#${h}`).join(' ')}` : caption;

      const connection = connectionMap[platform];
      const hasConnection = !!connection;

      if (hasConnection && postMode === 'auto' && platform === 'facebook') {
        try {
          const postResult = await postToFacebookPage({
            connection,
            caption: fullCaption,
            campaignUrl: resolvedCampaignUrl,
          });
          return {
            platform,
            method: 'auto_post',
            ok: true,
            postUrl: postResult.postUrl,
            caption: fullCaption,
            message: `Posted to Facebook Page "${connection.pageName ?? 'Page'}"`,
          };
        } catch (err) {
          console.warn('[publishToSocial] Facebook API failed, falling back to share link:', err?.message ?? err);
        }
      }

      const builder = SHARE_URL_BUILDERS[platform];
      const shareUrl = builder
        ? builder({
            url: resolvedCampaignUrl ?? '',
            caption: fullCaption,
            title: promotion?.title ?? 'Campaign',
          })
        : null;

      return {
        platform,
        method: 'share_link',
        ok: true,
        shareUrl,
        caption: fullCaption,
        hashtags,
        connected: hasConnection,
        copyOnly: platform === 'instagram',
        message: shareUrl
          ? `Share link ready for ${platform}`
          : `Copy your campaign link and share on ${platform}`,
      };
    }),
  );

  const platformResults = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      platform: targetPlatforms[i],
      ok: false,
      error: r.reason?.message ?? 'unknown_error',
    };
  });

  const anyOk = platformResults.some((r) => r.ok);

  return {
    status: 'ok',
    output: {
      ok: anyOk,
      phase: 'share_links',
      campaignUrl: resolvedCampaignUrl,
      platforms: platformResults,
      message: anyOk
        ? `Campaign ready to share on ${platformResults.filter((r) => r.ok).map((r) => r.platform).join(', ')}`
        : 'Could not prepare share links',
    },
  };
}
