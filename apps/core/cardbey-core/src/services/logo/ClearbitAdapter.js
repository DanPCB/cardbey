/**
 * Logo.dev adapter (registry key "clearbit" for back-compat).
 * Clearbit (logo.clearbit.com) is deprecated; this adapter uses Logo.dev.
 *
 * GET https://img.logo.dev/{domain}?token=<LOGODEV_API_KEY>&size=200
 * Env: LOGODEV_API_KEY (pk_xxx from https://logo.dev)
 */
import {
  LogoSourceNotConfiguredError,
  normalizeLogoResult,
  resolveDomainFromQuery,
  isValidLogoResult,
} from './LogoResult.js';

export const source = 'clearbit';

const LOGO_DEV_BASE = 'https://img.logo.dev';

/**
 * Logo.dev returns application/json (e.g. {"msg":"invalid api token"}) on errors.
 * @param {Response} res
 */
function isLogoDevImageResponse(res) {
  if (!res.ok) return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json') || ct.includes('text/json')) return false;
  return true;
}

/** @param {string} logoUrl */
async function logoDevLogoExists(logoUrl) {
  try {
    const head = await fetch(logoUrl, { method: 'HEAD', redirect: 'follow' });
    if (isLogoDevImageResponse(head)) return true;
  } catch {
    /* fall through */
  }
  try {
    const get = await fetch(logoUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { Range: 'bytes=0-0' },
    });
    if (isLogoDevImageResponse(get)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function isConfigured() {
  return Boolean(process.env.LOGODEV_API_KEY && process.env.LOGODEV_API_KEY.trim());
}

/**
 * @param {string} query Brand name or domain
 * @returns {Promise<Array<ReturnType<typeof normalizeLogoResult>>>}
 */
export async function search(query) {
  const apiKey = process.env.LOGODEV_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new LogoSourceNotConfiguredError(source);
  }

  const rawQuery = String(query || '').trim();
  if (!rawQuery) return [];

  const domain = resolveDomainFromQuery(rawQuery);
  if (!domain) return [];

  const logoUrl =
    `${LOGO_DEV_BASE}/${encodeURIComponent(domain)}` +
    `?token=${encodeURIComponent(apiKey.trim())}&size=200`;

  try {
    if (!(await logoDevLogoExists(logoUrl))) return [];

    const result = normalizeLogoResult({
      id: `clearbit-${domain}`,
      source,
      name: rawQuery,
      domain,
      logo_url: logoUrl,
      format: 'png',
      license: 'Logo.dev',
      attribution_required: false,
    });

    return isValidLogoResult(result) ? [result] : [];
  } catch {
    return [];
  }
}

export default { source, isConfigured, search };
