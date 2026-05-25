/**
 * Logs structured warnings when legacy runway HTTP paths are used.
 * Does not block requests — compatibility remains until callers migrate.
 *
 * @see docs/RUNWAY_OWNERSHIP.md
 */

/** @type {{ code: string, match: (req: import('express').Request) => boolean, canonical: string }[]} */
const RULES = [
  {
    code: 'LEGACY_SCREEN_PLAYLIST_FULL',
    canonical: 'GET /api/device/:deviceId/playlist/full',
    match: (req) =>
      req.method === 'GET' &&
      /^\/api\/screens\/[^/]+\/playlist\/full\/?$/i.test(req.path),
  },
  {
    code: 'LEGACY_STORE_DRAFT_ALIAS',
    canonical: '/api/draft-store/* (same router)',
    match: (req) => req.path.startsWith('/api/store-draft'),
  },
  {
    code: 'LEGACY_PERFORMER_INTAKE_V1',
    canonical: 'POST /api/performer/intake/v2',
    match: (req) => req.method === 'POST' && req.path === '/api/performer/intake',
  },
  {
    code: 'LEGACY_SSE_ADMIN_KEY',
    canonical: 'GET /api/stream?key=agent-chat&missionId=&streamToken=',
    match: (req) => {
      if (req.method !== 'GET' && req.method !== 'OPTIONS') return false;
      const p = req.path === '/api/stream' || req.path === '/stream';
      if (!p) return false;
      const key = req.query?.key;
      return key === 'admin' || key == null;
    },
  },
  {
    code: 'LEGACY_PAIR_SCREENS',
    canonical: 'POST /api/device/request-pairing',
    match: (req) =>
      req.method === 'POST' && /^\/api\/screens\/pair\//i.test(req.path),
  },
];

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function runwayLegacyGuard(req, res, next) {
  for (const rule of RULES) {
    if (!rule.match(req)) continue;
    console.warn('[runway-legacy]', {
      code: rule.code,
      method: req.method,
      path: req.originalUrl || req.url,
      canonical: rule.canonical,
      hint: 'See docs/RUNWAY_OWNERSHIP.md',
    });
    res.setHeader('X-Cardbey-Runway-Legacy', rule.code);
    break;
  }
  next();
}
