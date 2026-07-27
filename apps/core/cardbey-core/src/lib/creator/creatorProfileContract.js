/**
 * Canonical CreateCreatorProfile input contract — shared by routes, runtime tools, and services.
 */

export const RESERVED_USERNAMES = new Set([
  'me',
  'progress',
  'analytics',
  'content',
  'admin',
  'api',
  'creator',
  'creators',
  'studio',
  'support',
  'help',
  'cardbey',
  'www',
  'null',
  'undefined',
]);

const USERNAME_MIN = 3;
const USERNAME_MAX = 30;
const USERNAME_PATTERN = /^[a-z0-9_-]+$/;

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeUsername(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * @param {string} username
 * @returns {Record<string, string>}
 */
export function validateUsernameFields(username) {
  const fields = {};
  if (!username) {
    fields.username = 'Username is required.';
    return fields;
  }
  if (username.length < USERNAME_MIN) {
    fields.username = `Username must be at least ${USERNAME_MIN} characters.`;
  } else if (username.length > USERNAME_MAX) {
    fields.username = `Username must be at most ${USERNAME_MAX} characters.`;
  } else if (!USERNAME_PATTERN.test(username)) {
    fields.username = 'Use letters, numbers, hyphens, and underscores only.';
  } else if (RESERVED_USERNAMES.has(username)) {
    fields.username = 'This username is reserved.';
  }
  return fields;
}

/**
 * @param {unknown} input
 * @returns {{ ok: true, data: object } | { ok: false, error: { code: string, message: string, fields: Record<string, string> } }}
 */
export function validateCreateCreatorProfileInput(input = {}) {
  const displayName = String(input.displayName ?? '').trim();
  const username = normalizeUsername(input.username);
  const bio = input.bio != null ? String(input.bio).trim() : undefined;
  const avatar = input.avatarUrl ?? input.avatar;
  const banner = input.bannerUrl ?? input.banner;
  const country = input.country != null ? String(input.country).trim() : undefined;

  const languages = Array.isArray(input.languages)
    ? input.languages.map((l) => String(l).trim()).filter(Boolean)
    : [];
  const categories = Array.isArray(input.categories)
    ? input.categories.map((c) => String(c).trim()).filter(Boolean)
    : [];

  const fields = {};
  if (!displayName) {
    fields.displayName = 'Display name is required.';
  }
  Object.assign(fields, validateUsernameFields(username));

  if (Object.keys(fields).length > 0) {
    return {
      ok: false,
      error: {
        code: 'CREATOR_PROFILE_VALIDATION_FAILED',
        message: 'Please correct the highlighted fields.',
        fields,
      },
    };
  }

  return {
    ok: true,
    data: {
      displayName,
      username,
      bio: bio || null,
      avatar: avatar ? String(avatar).trim() : null,
      banner: banner ? String(banner).trim() : null,
      country: country || null,
      languages,
      categories,
    },
  };
}

/**
 * @param {Error & { code?: string, fields?: Record<string, string> }} err
 */
export function isCreatorProfileValidationError(err) {
  return (
    err &&
    typeof err === 'object' &&
    (err.code === 'CREATOR_PROFILE_VALIDATION_FAILED' || err.code === 'CREATOR_USERNAME_TAKEN')
  );
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, string>} [fields]
 */
export function createCreatorProfileError(code, message, fields = {}) {
  const err = new Error(message);
  err.code = code;
  err.fields = fields;
  return err;
}
