/**
 * generate_campaign_copy — Deterministic campaign copy from brief (Phase 2 template).
 */

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
 * @param {string} [input.storeId]
 * @param {object} [input.brief]
 * @param {string} [input.tone]
 * @param {string[]} [input.platforms]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  try {
    const storeId =
      (typeof input?.storeId === 'string' && input.storeId.trim()) ||
      (typeof context?.storeId === 'string' && context.storeId.trim()) ||
      null;

    const brief = input?.brief && typeof input.brief === 'object' ? input.brief : {};
    const tone = String(input?.tone ?? brief?.tone ?? 'friendly').trim() || 'friendly';
    const platforms = Array.isArray(input?.platforms) && input.platforms.length
      ? input.platforms.map((p) => String(p).trim()).filter(Boolean)
      : ['instagram', 'facebook', 'whatsapp'];

    const copy = buildCopyFromBrief(brief, tone, platforms);

    return {
      status: 'ok',
      output: {
        ok: true,
        storeId,
        copy,
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      status: 'failed',
      error: { code: 'COPY_FAILED', message },
      output: { ok: false, error: message },
    };
  }
}

export default execute;
