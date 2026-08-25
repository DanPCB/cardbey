/**
 * Phase 2 — published store URLs for the standard sitemap (not a separate AI sitemap).
 *
 * GET /sitemap-stores.xml
 */

import express from 'express';
import { prisma } from '../lib/prisma.js';
import { publicWebBase } from '../utils/publicWebBase.js';
import { isPublicFeedEligibleBusiness } from '../utils/publicStoreVisibility.js';

const router = express.Router();
const MAX_URLS = 50000;

function origin() {
  const base = publicWebBase() || process.env.PUBLIC_APP_URL || process.env.DASHBOARD_URL || '';
  return String(base).replace(/\/+$/, '') || 'https://cardbey.com';
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

router.get('/sitemap-stores.xml', async (_req, res, next) => {
  try {
    const rows = await prisma.business.findMany({
      where: {
        publishedAt: { not: null },
        isActive: true,
      },
      select: {
        id: true,
        slug: true,
        updatedAt: true,
        publishedAt: true,
        isActive: true,
        claimStatus: true,
        userId: true,
        isGuestDraft: true,
        expiresAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_URLS,
    });

    const base = origin();
    const urls = rows
      .filter((b) => b.slug && isPublicFeedEligibleBusiness(b))
      .map((b) => {
        const lastmod = (b.updatedAt || b.publishedAt || new Date()).toISOString().slice(0, 10);
        const loc = `${base}/s/${encodeURIComponent(b.slug)}`;
        return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.setHeader('X-Cardbey-Sitemap', 'stores');
    return res.status(200).send(xml);
  } catch (err) {
    return next(err);
  }
});

export default router;
