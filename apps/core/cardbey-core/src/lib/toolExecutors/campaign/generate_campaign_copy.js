/**
 * generate_campaign_copy — Deterministic campaign copy from brief (Phase 2 template).
 */

import { executeContentTool } from '../executeContentTool.js';

/**
 * @param {object} brief
 * @param {string} tone
 * @param {string[]} platforms
 */
function buildCopyFromBrief(brief, tone, platforms) {
  const objective = String(brief?.objective ?? 'our latest offer').trim();
  const offer = brief?.offer ? String(brief.offer).trim() : '';
  const audience = String(brief?.targetAudience ?? 'local customers').trim();

  const headline = offer ? `${objective} — ${offer}` : objective;
  const caption = `${objective}${offer ? ` (${offer})` : ''}. Perfect for ${audience}. Tone: ${tone}.`;
  const cta = offer ? `Claim ${offer} now` : 'Shop now';

  const hashtags = ['#shoplocal', '#promo', '#localbusiness'];
  if (offer) hashtags.push('#sale');

  /** @type {Record<string, string>} */
  const platformVariants = {};
  for (const platform of platforms) {
    const label = String(platform ?? '').trim();
    if (!label) continue;
    platformVariants[label] = `${headline}\n\n${caption}\n\n${cta}`;
  }

  return { headline, caption, cta, hashtags, platformVariants };
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeContentTool({
    toolName: 'generate_campaign_copy',
    input,
    context,
    processor: (inp, ctx) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const brief = inp?.brief && typeof inp.brief === 'object' ? inp.brief : {};
      const tone = String(inp?.tone ?? brief?.tone ?? 'friendly').trim() || 'friendly';
      const platforms = Array.isArray(inp?.platforms) && inp.platforms.length
        ? inp.platforms.map((p) => String(p).trim()).filter(Boolean)
        : ['instagram', 'facebook', 'whatsapp'];

      const copy = buildCopyFromBrief(brief, tone, platforms);
      return { storeId, copy };
    },
    isEmpty: (result) => !String(result?.copy?.headline ?? '').trim(),
    countRecords: (result) => Object.keys(result?.copy?.platformVariants ?? {}).length || 1,
  });
}

export default execute;
