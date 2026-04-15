/**
 * Intent Capture: Public offer page (no auth).
 * GET /p/:storeSlug/offers/:offerSlug — HTML with OpenGraph + JSON-LD; records page_view.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

function getBaseUrl(req) {
  const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE;
  if (envBase) return envBase.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function escapeHtml(s) {
  if (s == null || s === '') return '';
  const str = String(s);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

router.get('/:storeSlug/offers/:offerSlug', async (req, res, next) => {
  try {
    const storeSlug = (req.params.storeSlug || '').trim();
    const offerSlug = (req.params.offerSlug || '').trim();
    if (!storeSlug || !offerSlug) return res.status(404).send('Not found');

    const store = await prisma.business.findUnique({
      where: { slug: storeSlug, isActive: true },
      select: { id: true, name: true, address: true, suburb: true, postcode: true, country: true },
    });
    if (!store) return res.status(404).send('Store not found');

    const offer = await prisma.storeOffer.findFirst({
      where: { storeId: store.id, slug: offerSlug, isActive: true },
    });
    if (!offer) return res.status(404).send('Offer not found');

    const baseUrl = getBaseUrl(req);
    const canonical = baseUrl + '/p/' + storeSlug + '/offers/' + offerSlug;
    const title = offer.title;
    const desc = (offer.description || '').slice(0, 200);
    const priceText = offer.priceText || '';
    const storeName = store.name;
    const locParts = [store.address, store.suburb, store.postcode, store.country].filter(Boolean);
    const location = locParts.join(', ');

    await prisma.intentSignal.create({
      data: { type: 'offer_view', storeId: store.id, offerId: offer.id, userAgent: req.get('user-agent') || null, referrer: req.get('referer') || null },
    });

    const jsonLd = { '@context': 'https://schema.org', '@graph': [
      { '@type': 'Offer', name: title, description: desc || undefined, price: priceText || undefined, url: canonical },
      { '@type': 'LocalBusiness', name: storeName, address: location ? { '@type': 'PostalAddress', streetAddress: store.address, addressLocality: store.suburb, postalCode: store.postcode, addressCountry: store.country } : undefined },
    ]};

    const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<title>' + escapeHtml(title) + ' — ' + escapeHtml(storeName) + '</title>'
      + '<meta property="og:title" content="' + escapeHtml(title) + '">'
      + '<meta property="og:description" content="' + escapeHtml(desc) + '">'
      + '<meta property="og:url" content="' + escapeHtml(canonical) + '">'
      + '<meta property="og:type" content="website">'
      + '<link rel="canonical" href="' + escapeHtml(canonical) + '">'
      + '<script type="application/ld+json">' + JSON.stringify(jsonLd) + '</script>'
      + '<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:1.5rem;}h1{font-size:1.5rem;}.store{color:#666;}.price{font-size:1.25rem;font-weight:600;}.cta{display:inline-block;margin-top:1rem;padding:.75rem 1.5rem;background:#111;color:#fff;text-decoration:none;border-radius:6px;}</style></head><body>'
      + '<h1>' + escapeHtml(title) + '</h1>'
      + '<p class="store">' + escapeHtml(storeName) + (location ? ' · ' + escapeHtml(location) : '') + '</p>'
      + (priceText ? '<p class="price">' + escapeHtml(priceText) + '</p>' : '')
      + (desc ? '<p>' + escapeHtml(desc) + '</p>' : '')
      + '<a class="cta" href="' + escapeHtml(canonical) + '">View offer</a></body></html>';

    res.type('text/html').send(html);
  } catch (err) {
    next(err);
  }
});

export default router;
