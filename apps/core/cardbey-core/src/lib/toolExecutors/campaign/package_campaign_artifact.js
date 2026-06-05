/**
 * package_campaign_artifact — Bundle brief, graphics, and copy into a publishable artifact.
 */

import { randomUUID } from 'node:crypto';

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 * @param {object} [input.brief]
 * @param {object[]} [input.graphics]
 * @param {object} [input.copy]
 * @param {string|null} [input.slideshowId]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  try {
    const storeId =
      (typeof input?.storeId === 'string' && input.storeId.trim()) ||
      (typeof context?.storeId === 'string' && context.storeId.trim()) ||
      null;

    const brief = input?.brief && typeof input.brief === 'object' ? input.brief : null;
    const graphics = Array.isArray(input?.graphics) ? input.graphics : [];
    const copy = input?.copy && typeof input.copy === 'object' ? input.copy : null;
    const slideshowId =
      typeof input?.slideshowId === 'string' && input.slideshowId.trim()
        ? input.slideshowId.trim()
        : null;

    const artifact = {
      id: randomUUID(),
      storeId,
      type: 'campaign',
      brief,
      graphics,
      copy,
      slideshowId,
      status: 'ready',
      createdAt: new Date().toISOString(),
    };

    return {
      status: 'ok',
      output: {
        ok: true,
        artifact,
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      status: 'failed',
      error: { code: 'PACKAGE_FAILED', message },
      output: { ok: false, error: message },
    };
  }
}

export default execute;
