/**
 * Phase 2 — crawlable storefront HTML for bots / social previews.
 *
 * GET /s/:slug
 * - Crawler UAs or ?_prerender=1 → SKP-backed HTML (canonical, OG, JSON-LD)
 * - Normal browsers / missing store → next() so SPA (or downstream) can handle UI
 */

import express from 'express';
import {
  buildSKPBySlug,
  skpToJsonLd,
  skpToPublicDto,
} from '../lib/storeKnowledge/index.js';
import { abrVerificationUrl, isPublicStoreUnclaimed } from '../lib/storeCompliance/publicClaimStatus.js';
import { publicCanonicalWebBase } from '../utils/publicWebBase.js';

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
  return publicCanonicalWebBase();
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
    .disclosure-banner{background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:12px 16px;margin:12px 0;font-size:13px}
  </style>
</head>
<body>
  <article>
    <h1>${escapeHtml(dto.name || '')}</h1>
    ${
      isPublicStoreUnclaimed({
        claimStatus: skp.visibility?.claimStatus,
        provenance: skp.visibility?.provenance,
      })
        ? `<div class="disclosure-banner" role="note">
    <p><strong>This profile hasn't been claimed yet.</strong>
    Built using publicly available information about ${escapeHtml(dto.name || '')}.
    Not confirmed by the business owner.</p>
    ${
      dto.abn
        ? `<p>ABN: ${escapeHtml(dto.abn)}.
    <a href="${escapeHtml(abrVerificationUrl(dto.abn) || '#')}" rel="noopener">Verify on Australian Business Register</a></p>`
        : ''
    }
    <p>AI-assisted content: descriptions and images generated from public data.</p>
  </div>`
        : ''
    }
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
    // Humans / non-crawlers: fall through to SPA (or Core 404 if no SPA).
    if (!isBotRequest(req)) {
      res.setHeader('X-Cardbey-Prerender', 'skip');
      return next();
    }

    const slug = String(req.params.slug || '').trim();
    if (!slug) return next();

    const skp = await buildSKPBySlug(slug);
    // Missing / not indexable: fall through (SPA 404 UI) — never JSON 404 here.
    if (!skp || !skp.visibility?.indexable) {
      res.setHeader('X-Cardbey-Prerender', 'miss');
      return next();
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
