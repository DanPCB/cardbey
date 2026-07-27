/**
 * Public + ghost store matching from vision extraction (name + optional GPS).
 */

import { getPrismaClient } from '../prisma.js';
import { caseInsensitiveFilter } from '../dbCapabilities.js';
import { hasBusinessColumn } from '../businessColumnCapabilities.js';

const GHOST_DEDUP_RADIUS_M = 250;

/**
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * @param {string} businessName
 * @param {{ lat?: number; lng?: number } | null} location
 */
export async function matchStoreByVisionExtraction(businessName, location) {
  const name = String(businessName ?? '').trim();
  if (name.length < 2) return null;

  const prisma = getPrismaClient();
  const exact = await prisma.business.findMany({
    where: {
      isActive: true,
      name: caseInsensitiveFilter(name, 'equals'),
      ...(hasBusinessColumn('claimStatus')
        ? { NOT: { claimStatus: 'removed' } }
        : {}),
    },
    select: { id: true, name: true, slug: true, lat: true, lng: true },
    take: 5,
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    if (location?.lat != null && location?.lng != null) {
      const withGps = exact.filter((r) => r.lat != null && r.lng != null);
      if (withGps.length === 1) return withGps[0];
    }
    return null;
  }

  const fuzzy = await prisma.business.findMany({
    where: {
      isActive: true,
      name: { contains: name.slice(0, 40) },
      ...(hasBusinessColumn('claimStatus')
        ? { NOT: { claimStatus: 'removed' } }
        : {}),
    },
    select: { id: true, name: true, slug: true, lat: true, lng: true },
    take: 8,
  });
  const filtered = fuzzy.filter((r) => r.name.toLowerCase().includes(name.toLowerCase()));
  if (filtered.length === 1) return filtered[0];
  return null;
}

/**
 * Ghost-specific dedup: consumer_capture stores with similar name within ~250m.
 * @param {string} businessName
 * @param {{ lat?: number; lng?: number } | null} location
 */
export async function findGhostStoreDuplicate(businessName, location) {
  if (!hasBusinessColumn('provenance') || !hasBusinessColumn('claimStatus')) return null;

  const name = String(businessName ?? '').trim();
  if (name.length < 2) return null;

  const prisma = getPrismaClient();
  const candidates = await prisma.business.findMany({
    where: {
      isActive: true,
      provenance: 'consumer_capture',
      claimStatus: { in: ['unclaimed', 'claim_pending'] },
      name: caseInsensitiveFilter(name, 'equals'),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      lat: true,
      lng: true,
      captureCount: true,
      claimStatus: true,
      provenance: true,
    },
    take: 10,
  });

  if (!candidates.length) return null;
  if (location?.lat == null || location?.lng == null) {
    return candidates.length === 1 ? candidates[0] : null;
  }

  const nearby = candidates.filter((row) => {
    if (row.lat == null || row.lng == null) return false;
    return distanceMeters(location.lat, location.lng, row.lat, row.lng) <= GHOST_DEDUP_RADIUS_M;
  });
  if (nearby.length === 1) return nearby[0];
  return null;
}
