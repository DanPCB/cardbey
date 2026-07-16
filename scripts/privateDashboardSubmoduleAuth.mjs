/**
 * Pure helpers for private dashboard submodule auth (testable without git/network).
 */

export function shouldInitDashboardSubmodule(env = process.env) {
  return String(env.CARDBEY_INIT_DASHBOARD_SUBMODULE || '').toLowerCase() === 'true';
}

/**
 * @returns {{ ok: true, token: string } | { ok: false, message: string }}
 */
export function validateSubmoduleToken(env = process.env) {
  const token = String(env.GITHUB_SUBMODULE_TOKEN || '').trim();
  if (!token) {
    return {
      ok: false,
      message:
        'Private dashboard source is unavailable. Cause: Missing authenticated access for dashboard repository (GITHUB_SUBMODULE_TOKEN).',
    };
  }
  return { ok: true, token };
}

/** Build rewrite base URL without logging. Caller must not print this when token is real. */
export function buildGithubHttpsInsteadOfUrl(token) {
  const t = String(token || '').trim();
  if (!t) {
    throw new Error('token required');
  }
  return `https://x-access-token:${t}@github.com/`;
}

/** Redact token-bearing URLs for safe diagnostics. */
export function redactGithubTokenUrl(url) {
  return String(url || '').replace(
    /https:\/\/x-access-token:[^@\s]+@github\.com\//gi,
    'https://x-access-token:***@github.com/',
  );
}
