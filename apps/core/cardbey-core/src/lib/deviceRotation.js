/**
 * Device display rotation — canonical degrees with legacy orientation dual-wire.
 *
 * SOT: rotationDegrees (0–359). orientation ("horizontal"|"vertical") is derived
 * for older players until they read rotationDegrees.
 */

/**
 * @param {unknown} raw
 * @returns {number | null} integer in 0..359, or null if invalid/missing
 */
export function normalizeRotationDegrees(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 359) return null;
  return rounded;
}

/**
 * @param {unknown} orientation
 * @returns {number}
 */
export function rotationDegreesFromOrientation(orientation) {
  const v = String(orientation || '')
    .trim()
    .toLowerCase();
  if (v === 'vertical' || v === 'portrait') return 90;
  return 0;
}

/**
 * Legacy binary orientation for old clients.
 * 90/270 → vertical; 0/180 (and other) → horizontal.
 * @param {unknown} degrees
 * @returns {'horizontal' | 'vertical'}
 */
export function orientationFromRotationDegrees(degrees) {
  const d = normalizeRotationDegrees(degrees);
  if (d === null) return 'horizontal';
  const nearestQuarter = ((Math.round(d / 90) % 4) + 4) % 4;
  if (nearestQuarter === 1 || nearestQuarter === 3) return 'vertical';
  return 'horizontal';
}

/**
 * Resolve wire fields from DB row or request body.
 * Prefer rotationDegrees when valid; else map from orientation.
 *
 * @param {{ rotationDegrees?: unknown, orientation?: unknown } | null | undefined} input
 * @returns {{ rotationDegrees: number, orientation: 'horizontal' | 'vertical' }}
 */
export function resolveDeviceRotation(input) {
  const fromDegrees = normalizeRotationDegrees(input?.rotationDegrees);
  if (fromDegrees !== null) {
    return {
      rotationDegrees: fromDegrees,
      orientation: orientationFromRotationDegrees(fromDegrees),
    };
  }
  const orientationRaw = String(input?.orientation || '')
    .trim()
    .toLowerCase();
  const orientation =
    orientationRaw === 'vertical' || orientationRaw === 'horizontal'
      ? orientationRaw
      : orientationRaw === 'portrait'
        ? 'vertical'
        : orientationRaw === 'landscape'
          ? 'horizontal'
          : 'horizontal';
  return {
    rotationDegrees: rotationDegreesFromOrientation(orientation),
    orientation,
  };
}

/**
 * Parse update body: rotationDegrees wins when both provided.
 *
 * @param {{ rotationDegrees?: unknown, orientation?: unknown }} body
 * @returns {{ ok: true, rotationDegrees: number, orientation: 'horizontal' | 'vertical' } | { ok: false, error: string, message: string } | null}
 *   null when neither field was provided
 */
export function parseRotationUpdate(body) {
  const hasDegrees = body?.rotationDegrees !== undefined && body?.rotationDegrees !== null;
  const hasOrientation = body?.orientation !== undefined && body?.orientation !== null;

  if (!hasDegrees && !hasOrientation) return null;

  if (hasDegrees) {
    const degrees = normalizeRotationDegrees(body.rotationDegrees);
    if (degrees === null) {
      return {
        ok: false,
        error: 'invalid_rotationDegrees',
        message: 'rotationDegrees must be an integer from 0 to 359',
      };
    }
    return {
      ok: true,
      rotationDegrees: degrees,
      orientation: orientationFromRotationDegrees(degrees),
    };
  }

  const orientationRaw = String(body.orientation).trim().toLowerCase();
  if (orientationRaw !== 'horizontal' && orientationRaw !== 'vertical') {
    return {
      ok: false,
      error: 'invalid_orientation',
      message: 'Orientation must be "horizontal" or "vertical"',
    };
  }
  return {
    ok: true,
    rotationDegrees: rotationDegreesFromOrientation(orientationRaw),
    orientation: orientationRaw,
  };
}
