/**
 * Phase 4 — reusable resource kits (first-class collections).
 * Save / reuse / duplicate / share / publish (publish = kit metadata only; not live store publish).
 */

import { randomBytes } from 'node:crypto';
import { KIT_STATUS } from './types.js';

/** @type {Map<string, object>} */
const kits = new Map();

function id(prefix = 'urikit') {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

export function resetKitsForTests() {
  kits.clear();
}

/**
 * @param {object} input
 */
export function saveResourceKit(input = {}) {
  const resourceIds = Array.isArray(input.resourceIds) ? input.resourceIds.filter(Boolean) : [];
  if (!resourceIds.length && !input.components?.length) {
    return { ok: false, error: 'resources_required' };
  }

  const kit = {
    id: input.id || id(),
    name: String(input.name || 'Untitled Kit').slice(0, 120),
    industry: input.industry || null,
    description: input.description || null,
    resourceIds,
    components: input.components || [
      { role: 'video', resourceIds: resourceIds.filter((_, i) => i % 4 === 0) },
      { role: 'image', resourceIds: resourceIds.filter((_, i) => i % 4 === 1) },
      { role: 'audio', resourceIds: resourceIds.filter((_, i) => i % 4 === 2) },
      { role: 'template', resourceIds: resourceIds.filter((_, i) => i % 4 === 3) },
    ],
    slots: input.slots || [
      'video',
      'music',
      'display_playlist',
      'poster',
      'menu',
      'social_post',
      'qr',
      'promotion',
    ],
    status: KIT_STATUS.SAVED,
    published: false,
    shareToken: null,
    ownerUserId: input.userId || null,
    workspaceId: input.workspaceId || null,
    sourceTask: input.businessTask || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    authority: 'uri_resource_kits',
  };
  kits.set(kit.id, kit);
  return { ok: true, kit };
}

export function getResourceKit(kitId) {
  return kits.get(kitId) || null;
}

export function listResourceKits({ userId, industry, limit = 40 } = {}) {
  return [...kits.values()]
    .filter((k) => !userId || k.ownerUserId === userId)
    .filter((k) => !industry || k.industry === industry)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, limit);
}

export function duplicateResourceKit(kitId, { userId, name } = {}) {
  const src = kits.get(kitId);
  if (!src) return { ok: false, error: 'kit_not_found' };
  return saveResourceKit({
    ...src,
    id: undefined,
    name: name || `${src.name} (copy)`,
    userId: userId || src.ownerUserId,
    status: KIT_STATUS.SAVED,
    published: false,
    shareToken: null,
  });
}

export function shareResourceKit(kitId) {
  const kit = kits.get(kitId);
  if (!kit) return { ok: false, error: 'kit_not_found' };
  kit.status = KIT_STATUS.SHARED;
  kit.shareToken = `share_${randomBytes(6).toString('hex')}`;
  kit.updatedAt = new Date().toISOString();
  kits.set(kitId, kit);
  return { ok: true, kit, note: 'Share token issued — kit metadata only, not live publication' };
}

/**
 * Publish kit catalogue entry — NOT autonomous store/campaign publication.
 */
export function publishResourceKit(kitId, { confirm = false } = {}) {
  const kit = kits.get(kitId);
  if (!kit) return { ok: false, error: 'kit_not_found' };
  if (!confirm) return { ok: false, error: 'confirmation_required' };
  kit.status = KIT_STATUS.PUBLISHED;
  kit.published = true;
  kit.updatedAt = new Date().toISOString();
  kits.set(kitId, kit);
  return {
    ok: true,
    kit,
    note: 'Kit catalogue published — does not publish live stores, playlists, or campaigns',
    livePublication: false,
  };
}

export function reuseResourceKit(kitId) {
  const kit = kits.get(kitId);
  if (!kit) return { ok: false, error: 'kit_not_found' };
  return {
    ok: true,
    kit,
    reusePlanHint: {
      resourceIds: kit.resourceIds,
      destinationsSuggested: [
        'display_playlist_draft',
        'promotion_draft',
        'social_content_draft',
      ],
      requiresUserConfirmation: true,
    },
  };
}
