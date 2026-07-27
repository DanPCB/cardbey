/**
 * Intake V1 deprecation — headers + structured log warnings.
 * @see docs/RUNWAY_OWNERSHIP.md
 */

export const INTAKE_V1_CANONICAL_PATH = '/api/performer/intake/v2';

/**
 * @param {import('express').Response} res
 */
export function applyIntakeV1DeprecationHeaders(res) {
  res.setHeader('Deprecation', 'true');
  res.setHeader(
    'X-API-Deprecated',
    `POST /api/performer/intake; use POST ${INTAKE_V1_CANONICAL_PATH}`,
  );
  res.setHeader('Link', `<${INTAKE_V1_CANONICAL_PATH}>; rel="successor-version"`);
}

/**
 * @param {import('express').Request} req
 */
export function logIntakeV1Deprecation(req) {
  console.warn('[intake-v1-deprecated]', {
    method: req.method,
    path: req.originalUrl || req.url,
    canonical: `POST ${INTAKE_V1_CANONICAL_PATH}`,
    actorId: req.user?.id ?? req.userId ?? req.guestId ?? null,
  });
}
