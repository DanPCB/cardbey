/**
 * Normalize and synthesize campaign_package artifacts for authority checks.
 */

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown> | null}
 */
export function normalizeCampaignPackageArtifact(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const brief = o.brief && typeof o.brief === 'object' ? o.brief : null;
  const graphics = Array.isArray(o.graphics) ? o.graphics : [];
  const copy = o.copy && typeof o.copy === 'object' ? o.copy : null;
  const poster = o.poster && typeof o.poster === 'object' ? o.poster : null;
  const graphicUrl =
    graphics.find(
      (g) =>
        g &&
        typeof g === 'object' &&
        typeof /** @type {Record<string, unknown>} */ (g).url === 'string' &&
        String(/** @type {Record<string, unknown>} */ (g).url).trim(),
    )?.url ?? null;
  const posterUrl =
    poster && typeof /** @type {Record<string, unknown>} */ (poster).url === 'string'
      ? String(/** @type {Record<string, unknown>} */ (poster).url).trim()
      : poster && typeof /** @type {Record<string, unknown>} */ (poster).previewUrl === 'string'
        ? String(/** @type {Record<string, unknown>} */ (poster).previewUrl).trim()
        : null;
  const url =
    (typeof o.url === 'string' && o.url.trim()) ||
    (typeof o.previewUrl === 'string' && o.previewUrl.trim()) ||
    graphicUrl ||
    posterUrl ||
    null;

  return {
    ...o,
    artifactType: 'campaign_package',
    type: 'campaign',
    subtype: 'campaign_package',
    status: typeof o.status === 'string' ? o.status : 'ready',
    url,
    previewUrl:
      (typeof o.previewUrl === 'string' && o.previewUrl.trim()) || url || null,
    metadata: {
      ...(o.metadata && typeof o.metadata === 'object' && !Array.isArray(o.metadata)
        ? o.metadata
        : {}),
      inlinePayload: {
        brief,
        graphics,
        copy,
        ...(poster ? { poster } : {}),
        slideshowId: o.slideshowId ?? null,
        slideshowUrl: o.slideshowUrl ?? null,
      },
    },
  };
}

/**
 * @param {Record<string, unknown>} toolOutputs
 * @returns {Record<string, unknown> | null}
 */
export function synthesizeCampaignPackageFromToolOutputs(toolOutputs) {
  const packageOut = toolOutputs.package_campaign_artifact;
  if (packageOut && typeof packageOut === 'object' && packageOut.artifact) {
    return normalizeCampaignPackageArtifact(packageOut.artifact);
  }

  const briefOut = toolOutputs.create_campaign_brief;
  const graphicsOut = toolOutputs.generate_campaign_graphics;
  const copyOut = toolOutputs.generate_campaign_copy;
  const posterOut = toolOutputs.generate_poster;
  const slideshowOut = toolOutputs.generate_slideshow;

  const brief =
    briefOut && typeof briefOut === 'object' && briefOut.brief && typeof briefOut.brief === 'object'
      ? briefOut.brief
      : null;
  const graphics =
    graphicsOut && typeof graphicsOut === 'object' && Array.isArray(graphicsOut.graphics)
      ? graphicsOut.graphics
      : [];
  const copy =
    copyOut && typeof copyOut === 'object' && copyOut.copy && typeof copyOut.copy === 'object'
      ? copyOut.copy
      : null;
  const poster =
    posterOut && typeof posterOut === 'object' && posterOut.poster && typeof posterOut.poster === 'object'
      ? posterOut.poster
      : null;
  const slideshowId =
    slideshowOut && typeof slideshowOut === 'object' && typeof slideshowOut.slideshowId === 'string'
      ? slideshowOut.slideshowId.trim()
      : null;
  const slideshowUrl =
    slideshowOut && typeof slideshowOut === 'object' && typeof slideshowOut.slideshowUrl === 'string'
      ? slideshowOut.slideshowUrl.trim()
      : null;

  if (!brief || !copy || graphics.length < 1) return null;
  if (!String(/** @type {Record<string, unknown>} */ (brief).objective ?? '').trim()) return null;
  if (!String(/** @type {Record<string, unknown>} */ (copy).headline ?? '').trim()) return null;
  if (!graphics.some((g) => g && typeof g === 'object' && String(g.url ?? '').trim())) return null;

  return normalizeCampaignPackageArtifact({
    id: `campaign_pkg_${Date.now()}`,
    brief,
    graphics,
    copy,
    ...(poster ? { poster } : {}),
    ...(slideshowId ? { slideshowId } : {}),
    ...(slideshowUrl ? { slideshowUrl } : {}),
    status: 'ready',
    createdAt: new Date().toISOString(),
  });
}
