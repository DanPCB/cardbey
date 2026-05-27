/**
 * Multi-store identity helpers — create vs update must never be inferred from active store alone.
 */

export function isMultiStoreIdentityV1Enabled() {
  return process.env.MULTI_STORE_IDENTITY_V1 !== 'false' && process.env.MULTI_STORE_IDENTITY_V1 !== '0';
}

/**
 * @param {string | null | undefined} storeId
 */
export function isExplicitStoreId(storeId) {
  const id = storeId != null ? String(storeId).trim() : '';
  return Boolean(id && id !== 'temp' && id !== 'draft');
}

/**
 * Resolve whether draft publish/commit should update an existing business or create a new one.
 *
 * @param {{ draft?: { committedStoreId?: string | null, input?: unknown }, storeIdParam?: string | null, targetStoreId?: string | null, mode?: 'create' | 'update' }} args
 */
export function resolveStoreWriteMode(args = {}) {
  const draft = args.draft;
  const committed =
    draft?.committedStoreId != null && String(draft.committedStoreId).trim()
      ? String(draft.committedStoreId).trim()
      : null;
  const target =
    (args.targetStoreId && String(args.targetStoreId).trim()) ||
    (args.storeIdParam && isExplicitStoreId(args.storeIdParam) ? String(args.storeIdParam).trim() : null) ||
    null;

  if (args.mode === 'update') {
    const id = target || committed;
    return { mode: 'update', storeId: id, reason: 'explicit_update' };
  }
  if (args.mode === 'create') {
    return { mode: 'create', storeId: null, reason: 'explicit_create' };
  }

  if (committed) {
    return { mode: 'update', storeId: committed, reason: 'draft_committed_store_id' };
  }
  if (target) {
    return { mode: 'update', storeId: target, reason: 'explicit_target_store_id' };
  }
  return { mode: 'create', storeId: null, reason: 'greenfield' };
}

export function logStoreIdentity(tag, fields) {
  console.log(`[${tag}]`, {
    draftId: fields.draftId,
    storeId: fields.storeId,
    mode: fields.mode,
    reason: fields.reason,
    ownerId: fields.ownerId,
  });
}
