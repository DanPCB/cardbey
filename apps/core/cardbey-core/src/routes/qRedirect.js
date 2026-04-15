/**
 * GET /q/:code — Resolve DynamicQr, record ScanEvent + IntentSignal (qr_scan), 302 redirect.
 * No auth. Same redirect logic as /api/qr/:code/resolve.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

/** Prefer /s/:slug for published storefront; fallback to preview/store when slug missing. */
async function publicStorefrontRedirectUrl(baseUrl, storeId) {
  if (!storeId) return null;
  const business = await prisma.business.findUnique({
    where: { id: storeId },
    select: { slug: true },
  });
  const slug = business?.slug && String(business.slug).trim();
  const root = String(baseUrl).replace(/\/$/, '');
  if (slug) {
    return `${root}/s/${encodeURIComponent(slug)}`;
  }
  return `${root}/preview/store/${storeId}?view=public`;
}

function getBaseUrl(req) {
  const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE;
  if (envBase) return envBase.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function appendUtmParams(url, codeOrSlug) {
  if (!url || typeof url !== 'string') return url;
  const campaign = (codeOrSlug && String(codeOrSlug).slice(0, 20)) || 'qr';
  const sep = url.includes('?') ? '&' : '?';
  const utm = 'utm_source=qr&utm_medium=print&utm_campaign=' + encodeURIComponent(campaign);
  return url + sep + utm;
}

router.get('/:code', async (req, res, next) => {
  try {
    const code = (req.params.code || '').trim().toLowerCase();
    if (!code) {
      return res.status(400).send('Bad request');
    }

    const row = await prisma.dynamicQr.findUnique({
      where: { code },
    });

    const baseUrl = getBaseUrl(req);

    if (!row || !row.isActive) {
      const storeId = row?.storeId;
      let fallback = storeId
        ? await publicStorefrontRedirectUrl(baseUrl, storeId)
        : baseUrl.startsWith('http')
          ? baseUrl
          : `${baseUrl}/`;
      return res.redirect(302, fallback);
    }

    await prisma.scanEvent.create({
      data: {
        dynamicQrId: row.id,
        storeId: row.storeId,
        userAgent: req.get('user-agent') || null,
        referer: req.get('referer') || null,
      },
    });

    const offerId = row.payload && typeof row.payload === 'object' ? row.payload.offerId : null;
    await prisma.intentSignal.create({
      data: {
        type: 'qr_scan',
        storeId: row.storeId,
        offerId: offerId || null,
        code: row.code,
        userAgent: req.get('user-agent') || null,
        referrer: req.get('referer') || null,
      },
    });

    let redirectUrl = row.targetPath || '';
    if (redirectUrl && !redirectUrl.startsWith('http')) {
      redirectUrl = baseUrl.replace(/\/$/, '') + (redirectUrl.startsWith('/') ? '' : '/') + redirectUrl;
    }
    if (!redirectUrl && row.type === 'promotion' && row.payload && row.payload.publicId) {
      redirectUrl = baseUrl.replace(/\/$/, '') + '/p/promo/' + row.payload.publicId;
    }
    if (!redirectUrl && row.type === 'offer' && row.payload && row.payload.storeSlug && row.payload.offerSlug) {
      redirectUrl = baseUrl.replace(/\/$/, '') + '/p/' + row.payload.storeSlug + '/offers/' + row.payload.offerSlug;
    }
    if (!redirectUrl) {
      redirectUrl = await publicStorefrontRedirectUrl(baseUrl, row.storeId);
    }
    redirectUrl = appendUtmParams(redirectUrl, row.code);

    res.redirect(302, redirectUrl);
  } catch (err) {
    next(err);
  }
});

export default router;
