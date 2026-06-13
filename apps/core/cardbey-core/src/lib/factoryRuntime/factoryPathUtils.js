/**
 * Path utilities for Factory Runtime envelopes and execution state.
 */

/**
 * @param {unknown} obj
 * @param {string} path
 */
export function getPath(obj, path) {
  if (!path) return obj;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = /** @type {Record<string, unknown>} */ (cur)[p];
  }
  return cur;
}

/**
 * @param {unknown} obj
 * @param {string} path
 * @param {unknown} value
 */
export function setPath(obj, path, value) {
  const parts = String(path).split('.');
  if (!parts.length) return obj;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cur[key] || typeof cur[key] !== 'object' || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

/**
 * Deep-resolve mapping values; strings starting with $. use envelope paths.
 *
 * @param {unknown} template
 * @param {Record<string, unknown>} envelope
 */
export function resolveMappingValue(template, envelope) {
  if (typeof template === 'string' && template.startsWith('$.')) {
    return getPath(envelope, template.slice(2));
  }
  if (Array.isArray(template)) {
    return template.map((v) => resolveMappingValue(v, envelope));
  }
  if (template && typeof template === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(template)) {
      out[key] = resolveMappingValue(val, envelope);
    }
    return out;
  }
  return template;
}

/**
 * @param {Record<string, unknown>} mapping
 * @param {Record<string, unknown>} envelope
 */
export function resolveInputMappingDeep(mapping, envelope) {
  if (!mapping || typeof mapping !== 'object') return {};
  const out = {};
  for (const [key, template] of Object.entries(mapping)) {
    out[key] = resolveMappingValue(template, envelope);
  }
  return out;
}
