/**
 * Vision intake location cascade: EXIF GPS → client geolocation → null + needsLocation.
 */

import exifr from 'exifr';

/**
 * @param {unknown} clientLocation
 * @returns {{ lat: number, lng: number } | null}
 */
export function parseClientLocation(clientLocation) {
  if (!clientLocation || typeof clientLocation !== 'object') return null;
  const lat = Number(clientLocation.lat);
  const lng = Number(clientLocation.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * @param {Buffer|ArrayBuffer|Uint8Array|null|undefined} buffer
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
export async function readExifGpsFromBuffer(buffer) {
  if (!buffer) return null;
  try {
    const gps = await exifr.gps(buffer);
    if (!gps || typeof gps !== 'object') return null;
    const lat = Number(gps.latitude);
    const lng = Number(gps.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * @param {Array<Buffer|{ buffer?: Buffer }>|null|undefined} imageBuffers
 * @param {unknown} clientLocation
 * @returns {Promise<{ location: { lat: number, lng: number, source: 'exif'|'client' } | null, needsLocation: boolean }>}
 */
export async function resolveVisionLocation({ imageBuffers, clientLocation } = {}) {
  const buffers = Array.isArray(imageBuffers) ? imageBuffers : [];
  for (const item of buffers) {
    const buf = Buffer.isBuffer(item) ? item : item?.buffer;
    const gps = await readExifGpsFromBuffer(buf);
    if (gps) {
      return {
        location: { ...gps, source: 'exif' },
        needsLocation: false,
      };
    }
  }

  const client = parseClientLocation(clientLocation);
  if (client) {
    return {
      location: { ...client, source: 'client' },
      needsLocation: false,
    };
  }

  return { location: null, needsLocation: true };
}
