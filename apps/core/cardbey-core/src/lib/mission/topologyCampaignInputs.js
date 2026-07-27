/**
 * Build campaign tool inputs from topology node + accumulated prior outputs.
 */

/**
 * @param {Record<string, unknown>} toolOutputs — latest output per toolName
 * @returns {object | null}
 */
function briefFromOutputs(toolOutputs) {
  const briefOut = toolOutputs.create_campaign_brief;
  if (briefOut && typeof briefOut === 'object' && briefOut.brief) {
    return /** @type {object} */ (briefOut.brief);
  }
  return null;
}

/**
 * @param {Record<string, unknown>} toolOutputs
 * @returns {object[]}
 */
function graphicsFromOutputs(toolOutputs) {
  const graphicsOut = toolOutputs.generate_campaign_graphics;
  if (graphicsOut && typeof graphicsOut === 'object' && Array.isArray(graphicsOut.graphics)) {
    return graphicsOut.graphics;
  }
  return [];
}

/**
 * @param {Record<string, unknown>} toolOutputs
 * @returns {object | null}
 */
function copyFromOutputs(toolOutputs) {
  const copyOut = toolOutputs.generate_campaign_copy;
  if (copyOut && typeof copyOut === 'object' && copyOut.copy) {
    return /** @type {object} */ (copyOut.copy);
  }
  return null;
}

/**
 * @param {Record<string, unknown>} toolOutputs
 * @returns {string | null}
 */
function slideshowIdFromOutputs(toolOutputs) {
  const slideshowOut = toolOutputs.generate_slideshow;
  if (!slideshowOut || typeof slideshowOut !== 'object') return null;
  const id =
    typeof slideshowOut.slideshowId === 'string'
      ? slideshowOut.slideshowId.trim()
      : typeof slideshowOut.artifact?.id === 'string'
        ? slideshowOut.artifact.id.trim()
        : '';
  return id || null;
}

/**
 * @param {Record<string, unknown>} toolOutputs
 * @returns {string | null}
 */
function slideshowUrlFromOutputs(toolOutputs) {
  const slideshowOut = toolOutputs.generate_slideshow;
  if (!slideshowOut || typeof slideshowOut !== 'object') return null;
  const candidates = [
    typeof slideshowOut.slideshowUrl === 'string' ? slideshowOut.slideshowUrl.trim() : '',
    typeof slideshowOut.artifact?.url === 'string' ? slideshowOut.artifact.url.trim() : '',
    typeof slideshowOut.artifact?.previewUrl === 'string' ? slideshowOut.artifact.previewUrl.trim() : '',
  ];
  for (const value of candidates) {
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} toolOutputs
 * @returns {object | null}
 */
function posterFromOutputs(toolOutputs) {
  const posterOut = toolOutputs.generate_poster;
  if (!posterOut || typeof posterOut !== 'object') return null;
  const poster = posterOut.poster;
  return poster && typeof poster === 'object' && !Array.isArray(poster) ? poster : null;
}

/**
 * @param {import('../artifact/types.ts').TopologyNode | Record<string, unknown>} node
 * @param {{
 *   storeId?: string | null;
 *   goal?: string | null;
 *   toolOutputs?: Record<string, unknown>;
 * }} context
 * @returns {Record<string, unknown>}
 */
export function buildCampaignNodeInput(node, context = {}) {
  const toolName = String(node?.toolName ?? '').trim();
  const storeId = typeof context.storeId === 'string' ? context.storeId.trim() : null;
  const goal = typeof context.goal === 'string' ? context.goal.trim() : '';
  const label =
    typeof node?.label === 'string'
      ? node.label.trim()
      : typeof node?.labels?.en === 'string'
        ? node.labels.en.trim()
        : '';
  const toolOutputs = context.toolOutputs && typeof context.toolOutputs === 'object' ? context.toolOutputs : {};

  const brief = briefFromOutputs(toolOutputs);
  const graphics = graphicsFromOutputs(toolOutputs);
  const copy = copyFromOutputs(toolOutputs);
  const slideshowId = slideshowIdFromOutputs(toolOutputs);
  const slideshowUrl = slideshowUrlFromOutputs(toolOutputs);
  const poster = posterFromOutputs(toolOutputs);

  switch (toolName) {
    case 'create_campaign_brief':
      return {
        storeId,
        objective: goal || label || 'promote my business',
      };
    case 'generate_campaign_graphics':
      return { storeId, brief: brief ?? {} };
    case 'generate_poster':
      return {
        storeId,
        posterType: 'promotional',
        customTitle:
          (typeof copy?.headline === 'string' && copy.headline.trim()) ||
          (typeof brief?.offer === 'string' && brief.offer.trim()) ||
          undefined,
        customSubtitle:
          (typeof copy?.cta === 'string' && copy.cta.trim()) ||
          (typeof brief?.offer === 'string' && brief.offer.trim()) ||
          undefined,
      };
    case 'generate_slideshow':
      return { storeId, brief: brief ?? {}, graphics };
    case 'generate_campaign_copy':
      return { storeId, brief: brief ?? {} };
    case 'qa_campaign_package':
      return { brief: brief ?? {}, graphics, copy: copy ?? {} };
    case 'package_campaign_artifact':
      return {
        storeId,
        brief,
        graphics,
        copy,
        ...(poster ? { poster } : {}),
        ...(slideshowId ? { slideshowId } : {}),
        ...(slideshowUrl ? { slideshowUrl } : {}),
      };
    default:
      return { storeId, ...(brief ? { brief } : {}), ...(graphics.length ? { graphics } : {}) };
  }
}
