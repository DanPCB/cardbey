/**
 * QR codes for personal presence store links (public store profile URL).
 * Uses the `qrcode` package (data URLs, same pattern as typical Node QR usage).
 */

import QRCode from 'qrcode';

/** Web origin for links embedded in QR (public storefront). */
export function getPublicWebOriginForStoreProfile() {
  const webBase = (process.env.PUBLIC_WEB_BASE_URL || process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (webBase) return webBase;
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:5174';
  return '';
}

/**
 * Canonical public profile URL for a published store slug.
 * @param {string} slug
 */
export function buildPublicStoreProfileUrl(slug) {
  const s = (slug && String(slug).trim()) || '';
  if (!s) return '';
  const origin = getPublicWebOriginForStoreProfile();
  if (!origin) return `/store/${encodeURIComponent(s)}`;
  return `${origin}/store/${encodeURIComponent(s)}`;
}

/**
 * @param {string} targetUrl
 * @returns {Promise<string>} PNG data URL
 */
export async function generateQrDataUrlForUrl(targetUrl) {
  const url = (targetUrl && String(targetUrl).trim()) || '';
  if (!url) return '';
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 256, type: 'image/png' });
}

/**
 * Validates ownership and returns prisma.user.update data for linking personal presence + QR.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {string} businessId
 * @returns {Promise<{ personalPresenceStoreId: string, qrCodeUrl: string } | null>}
 */
export async function getPersonalPresenceLinkFields(prisma, userId, businessId) {
  const uid = userId && String(userId).trim();
  const bid = businessId && String(businessId).trim();
  if (!prisma || !uid || !bid || uid.startsWith('guest_')) return null;
  const store = await prisma.business.findFirst({
    where: { id: bid, userId: uid },
    select: { slug: true },
  });
  if (!store?.slug) return null;
  const targetUrl = buildPublicStoreProfileUrl(store.slug);
  const qrCodeUrl = await generateQrDataUrlForUrl(targetUrl);
  if (!qrCodeUrl) return null;
  return { personalPresenceStoreId: bid, qrCodeUrl };
}

/**
 * After publish or slug change: refresh qrCodeUrl for every user linked to this business.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 */
export async function refreshPersonalPresenceQrForBusiness(prisma, businessId) {
  if (!businessId || !prisma) return;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { slug: true },
  });
  if (!business?.slug) return;
  const fullUrl = buildPublicStoreProfileUrl(business.slug);
  if (!fullUrl) return;
  const dataUrl = await generateQrDataUrlForUrl(fullUrl);
  if (!dataUrl) return;
  const linked = await prisma.user.findMany({
    where: { personalPresenceStoreId: businessId },
    select: { id: true },
  });
  await Promise.all(
    linked.map((u) =>
      prisma.user.update({
        where: { id: u.id },
        data: { qrCodeUrl: dataUrl },
      }),
    ),
  );
}
