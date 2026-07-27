/**
 * Normalize finding evidence to structured object + display lines (Phase 2).
 */

/**
 * @param {unknown} evidence
 * @returns {{ structured: Record<string, unknown>, lines: string[] }}
 */
export function normalizeEvidence(evidence) {
  if (evidence == null) {
    return { structured: {}, lines: [] };
  }
  if (Array.isArray(evidence)) {
    const lines = evidence.map((e) => String(e));
    return { structured: { notes: lines }, lines };
  }
  if (typeof evidence === 'object') {
    /** @type {Record<string, unknown>} */
    const structured = { ...evidence };
    const lines = Object.entries(structured).map(([k, v]) => {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        return `${k}=${v}`;
      }
      try {
        return `${k}=${JSON.stringify(v)}`;
      } catch {
        return `${k}=[unserializable]`;
      }
    });
    return { structured, lines };
  }
  const line = String(evidence);
  return { structured: { notes: [line] }, lines: [line] };
}

/**
 * Sanitize structured evidence values (drop secrets/paths).
 * @param {Record<string, unknown>} structured
 * @param {(s: string) => boolean} isBad
 */
export function sanitizeEvidenceObject(structured, isBad) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(structured || {})) {
    if (isBad(k)) continue;
    if (typeof v === 'string') {
      if (isBad(v)) continue;
      out[k] = v.length > 200 ? `${v.slice(0, 197)}...` : v;
    } else if (Array.isArray(v)) {
      out[k] = v
        .map((x) => (typeof x === 'string' ? x : String(x)))
        .filter((x) => !isBad(x))
        .slice(0, 20);
    } else if (typeof v === 'number' || typeof v === 'boolean' || v == null) {
      out[k] = v;
    } else {
      try {
        const s = JSON.stringify(v);
        if (!isBad(s)) out[k] = v;
      } catch {
        /* skip */
      }
    }
  }
  return out;
}
