/**
 * Generate a URL-safe handle from a name or email
 * Used for public profile URLs
 */

/**
 * Convert a string to a kebab-case handle
 * @param {string} input - Input string (name or email)
 * @returns {string} - URL-safe handle
 */
export function generateHandle(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Extract local part from email if it's an email
  let base = input;
  if (input.includes('@')) {
    base = input.split('@')[0];
  }

  // Convert to lowercase and replace spaces/special chars with hyphens
  let handle = base
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50); // Limit length

  // Ensure handle is not empty
  if (!handle || handle.length === 0) {
    return null;
  }

  return handle;
}

/**
 * Generate a unique handle with suffix if needed
 * @param {string} baseHandle - Base handle
 * @param {Function} checkExists - Function to check if handle exists: (handle) => Promise<boolean>
 * @returns {Promise<string>} - Unique handle
 */
export async function generateUniqueHandle(baseHandle, checkExists) {
  if (!baseHandle) {
    return null;
  }

  let handle = baseHandle;
  let attempts = 0;
  const maxAttempts = 100;

  while (await checkExists(handle)) {
    attempts++;
    if (attempts > maxAttempts) {
      // Fallback to timestamp-based handle
      handle = `${baseHandle}-${Date.now()}`;
      break;
    }
    // Add numeric suffix
    handle = `${baseHandle}-${attempts}`;
  }

  return handle;
}

