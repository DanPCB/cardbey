/**
 * Deterministic content hash for approval integrity.
 */

import crypto from 'crypto';

/**
 * Material fields used for approval binding.
 * @param {object} content
 * @returns {string} sha256 hex
 */
export function computeContentHash(content = {}) {
  const structured = content.structured ?? content.metadata?.structured ?? null;
  const hook =
    structured?.hook ??
    content.hook ??
    content.metadata?.hook ??
    null;
  const ctaLabel =
    structured?.ctaLabel ??
    content.ctaLabel ??
    content.metadata?.ctaLabel ??
    null;

  const material = {
    title: content.title ?? null,
    body: content.body ?? null,
    language: content.language ?? null,
    contentType: content.contentType ?? null,
    structured: structured ?? null,
    hook,
    ctaLabel,
    destination: content.destination ?? null,
    mediaBrief: content.mediaBrief ?? null,
  };

  const canonical = JSON.stringify(material, Object.keys(material).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export default computeContentHash;
