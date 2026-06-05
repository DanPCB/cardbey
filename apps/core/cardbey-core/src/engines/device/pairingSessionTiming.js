/**
 * Pairing session TTL.
 *
 * Do NOT use device.createdAt — heartbeat rows can be days old.
 * Prefer capabilities.pairingCodeIssuedAt (set on request-pairing), then updatedAt.
 */

export const PAIRING_TTL_MS = 30 * 60 * 1000;

/**
 * @param {object|null} device
 * @param {string|Date|null} pairingCodeIssuedAt - from DeviceCapability JSON
 */
export function pairingSessionStartedAt(device, pairingCodeIssuedAt = null) {
  if (pairingCodeIssuedAt) {
    return pairingCodeIssuedAt instanceof Date ? pairingCodeIssuedAt : new Date(pairingCodeIssuedAt);
  }
  if (device?.updatedAt) {
    return device.updatedAt instanceof Date ? device.updatedAt : new Date(device.updatedAt);
  }
  if (device?.createdAt) {
    return device.createdAt instanceof Date ? device.createdAt : new Date(device.createdAt);
  }
  return new Date();
}

export function pairingExpiresAt(device, pairingCodeIssuedAt = null) {
  const started = pairingSessionStartedAt(device, pairingCodeIssuedAt);
  return new Date(started.getTime() + PAIRING_TTL_MS);
}

export function pairingTtlLeftMs(device, now = new Date(), pairingCodeIssuedAt = null) {
  if (!device?.pairingCode) return 0;
  return Math.max(0, pairingExpiresAt(device, pairingCodeIssuedAt).getTime() - now.getTime());
}

export function isPairingSessionExpired(device, now = new Date(), pairingCodeIssuedAt = null) {
  if (!device?.pairingCode) return false;
  return pairingTtlLeftMs(device, now, pairingCodeIssuedAt) <= 0;
}

/**
 * Read pairingCodeIssuedAt from DeviceCapability.capabilities JSON.
 */
export async function loadPairingCodeIssuedAt(db, deviceId) {
  if (!db?.deviceCapability || !deviceId) return null;
  try {
    const row = await db.deviceCapability.findUnique({
      where: { deviceId },
      select: { capabilities: true },
    });
    const caps = row?.capabilities;
    if (caps && typeof caps === 'object' && caps.pairingCodeIssuedAt) {
      return caps.pairingCodeIssuedAt;
    }
  } catch (e) {
    console.warn('[PAIRING_TIMING] loadPairingCodeIssuedAt failed:', e?.message);
  }
  return null;
}
