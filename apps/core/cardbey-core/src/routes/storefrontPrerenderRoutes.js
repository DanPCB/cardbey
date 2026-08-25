/**
 * Phase 2 — crawlable storefront HTML for bots / social previews.
 *
 * GET /s/:slug
 * - Crawler UAs or ?_prerender=1 → SKP-backed HTML (canonical, OG, JSON-LD)
 * - Normal browsers → 404 JSON with X-Cardbey-Prerender: skip
 *   (dashboard SPA remains the human storefront host)
 */

import express from 'express';
import {
  buildSKPBySlug,
  skpToJsonLd,
  skpToPublicDto,
} from '../lib/storeKnowledge/index.js';
import { publicWebBase } from '../utils/publicWebBase.js';

const router = express.Router();

export const BOT_UA =
  /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|sogou|exabot|facebot|facebookexternalhit|twitterbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|anthropic|chatgpt|perplexity|you\.com|ccbot|amazonbot/i;

export function isBotRequest(req) {
  if (String(req.query?._prerender || '') === '1') return true;
  const ua = String(req.get?.('user-agent') || req.headers?.['user-agent'] || '');
  return BOT_UA.test(ua);
}

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function publicOrigin() {
  const base = publicWebBase() || process.env.PUBLIC_APP_URL || process.env.DASHBOARD_URL || '';
  return String(base).replace(/\/+$/, '') || 'https://cardbey.com';
}

export function renderStoreHtml(skp) {
  const dto = skpToPublicDto(skp);
  const jsonLd = skpToJsonLd(skp);
  const canonical =
    skp.visibility.canonicalUrl || `${publicOrigin()}/s/${encodeURIComponent(dto.slug)}`;
  const titleBits = [dto.name, dto.suburb].filter(Boolean).join(' — ');
  const title = `${titleBits} | Cardbey`;
  const description = String(dto.description || dto.tagline || dto.name || '').slice(0, 160);
  const robots = skp.visibility.indexable ? 'index,follow' : 'noindex,nofollow';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="business.business">
  <meta property="og:title" content="${escapeHtml(dto.name || '')}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="Cardbey">
  ${dto.heroImageUrl ? `<meta property="og:image" content="${escapeHtml(dto.heroImageUrl)}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(dto.name || '')}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${dto.heroImageUrl ? `<meta name="twitter:image" content="${escapeHtml(dto.heroImageUrl)}">` : ''}
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
  <style>
    body{font-family:system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:1.5rem;line-height:1.5;color:#111}
    .muted{color:#555} a{color:#111}
  </style>
</head>
<body>
  <article>
    <h1>${escapeHtml(dto.name || '')}</h1>
    ${dto.tagline ? `<p class="muted">${escapeHtml(dto.tagline)}</p>` : ''}
    ${dto.description ? `<p>${escapeHtml(dto.description)}</p>` : ''}
    ${
      dto.suburb
        ? `<p class="muted">Located in ${escapeHtml(dto.suburb)}${dto.state ? `, ${escapeHtml(dto.state)}` : ''}</p>`
        : ''
    }
    ${dto.phone ? `<p><a href="tel:${escapeHtml(dto.phone)}">${escapeHtml(dto.phone)}</a></p>` : ''}
    ${dto.email ? `<p><a href="mailto:${escapeHtml(dto.email)}">${escapeHtml(dto.email)}</a></p>` : ''}
    ${dto.website ? `<p><a href="${escapeHtml(dto.website)}" rel="noopener">${escapeHtml(dto.website)}</a></p>` : ''}
    <p><a href="${escapeHtml(publicOrigin())}">Powered by Cardbey</a></p>
  </article>
</body>
</html>`;
}

router.get('/:slug', async (req, res, next) => {
  try {
    if (!isBotRequest(req)) {
      res.setHeader('X-Cardbey-Prerender', 'skip');
      return res.status(404).json({
        ok: false,
        prerender: false,
        message:
          'Storefront HTML prerender is for crawlers; use the Cardbey web app for browsing.',
      });
    }

    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(404).send('Not found');

    const skp = await buildSKPBySlug(slug);
    if (!skp || !skp.visibility.indexable) {
      return res.status(404).send('Store not found');
    }

    const html = renderStoreHtml(skp);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Cardbey-Prerender', '1');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(html);
  } catch (err) {
    return next(err);
  }
});

export default router;
