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
  // GitHub Actions rejects custom secrets whose names start with GITHUB_.
  // Repository Actions secret is CARDBEY_SUBMODULE_TOKEN; GITHUB_SUBMODULE_TOKEN
  // remains a Render/local alias.
  const token = String(env.CARDBEY_SUBMODULE_TOKEN || env.GITHUB_SUBMODULE_TOKEN || '').trim();
  if (!token) {
    return {
      ok: false,
      message:
        'Private dashboard source is unavailable. Cause: Missing authenticated access for dashboard repository (CARDBEY_SUBMODULE_TOKEN or GITHUB_SUBMODULE_TOKEN).',
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
