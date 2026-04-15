/**
 * HTTP GET utility with timeout and error classification
 * Windows-compatible (no bash-isms)
 */

/**
 * @typedef {Object} HttpGetResult
 * @property {boolean} ok - Whether the request succeeded
 * @property {number} status - HTTP status code (0 if error)
 * @property {string} [text] - Response text (if ok)
 * @property {string} [error] - Error message (if not ok)
 * @property {'refused'|'dns'|'timeout'|'network'} [type] - Error type (if not ok)
 */

/**
 * Perform HTTP GET request with timeout
 * @param {string} url - URL to fetch
 * @param {{ timeoutMs?: number }} [options] - Options
 * @returns {Promise<HttpGetResult>}
 */
export async function httpGet(url, { timeoutMs = 3000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    // Normalize common Undici/Node fetch errors
    const code = err?.code || err?.cause?.code;
    let type = 'network';
    
    if (code === 'ECONNREFUSED') {
      type = 'refused';
    } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      type = 'dns';
    } else if (err?.name === 'AbortError' || code === 'ETIMEDOUT') {
      type = 'timeout';
    }

    return {
      ok: false,
      status: 0,
      error: String(err?.message || err),
      type,
    };
  } finally {
    clearTimeout(t);
  }
}

