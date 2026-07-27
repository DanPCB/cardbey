/**
 * Block crawlers and non-browser clients from long-lived SSE connections.
 */

const BOT_USER_AGENTS = [
  'petalbot',
  'googlebot',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'sogou',
  'exabot',
  'facebot',
  'ia_archiver',
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
];

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isBotSseRequest(req) {
  const ua = String(req.headers['user-agent'] ?? '').toLowerCase();
  if (BOT_USER_AGENTS.some((bot) => ua.includes(bot))) return true;

  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  const origin = req.headers.origin;
  if (!origin) return true;
  const o = String(origin).toLowerCase();
  if (
    o.includes('cardbey.com') ||
    o.includes('localhost') ||
    o.includes('127.0.0.1') ||
    o.includes('onrender.com')
  ) {
    return false;
  }
  return true;
}
