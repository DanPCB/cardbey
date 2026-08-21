/**
 * Phase 2 — Performer Content Editing Bridge.
 * Connects Performer actions to canonical Website Editing revision + Shows lifecycle.
 * Proposals are not mutations until explicitly accepted.
 */

import { randomUUID } from 'node:crypto';
import { Features } from '../../config/features.js';
import { resolveWebsiteEditingContext } from '../websiteEditing/resolveWebsiteEditingContext.js';
import {
  getStoreShow,
  listStoreShows,
  upsertStoreShow,
  setStoreShowStatus,
  buildRelevanceWarning,
  normalizeShowWork,
} from '../storeShows/storeShowsService.js';
import { bumpPublicFeedRankForStore } from '../../lib/feed/publicFeedRankBump.js';
import { isPlatformAdmin } from '../../lib/authorization.js';

/** In-memory proposals — not a Shows CMS; discarded on process restart. */
const proposalStore = new Map();

const ALLOWED_SCOPES = new Set([
  'title',
  'description',
  'image',
  'cta',
  'selected',
  'entire',
  'relevance_title',
]);

const EDITABLE_FIELDS = [
  'title',
  'description',
  'kind',
  'mediaUrl',
  'thumbnailUrl',
  'ctaLabel',
  'ctaUrl',
  'altText',
];

function httpError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

export function isPerformerContentEditingBridgeEnabled() {
  return Boolean(Features.performerContentEditingBridge?.v1);
}

export function assertBridgeEnabled() {
  if (!isPerformerContentEditingBridgeEnabled()) {
    throw httpError(
      403,
      'bridge_disabled',
      'Performer content editing bridge is disabled',
    );
  }
}

function sanitizeReturnTo(raw) {
  if (raw == null) return null;
  let value = String(raw).trim();
  if (!value) return null;
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep */
  }
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  const lower = value.toLowerCase();
  if (
    lower.startsWith('http:') ||
    lower.startsWith('https:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.includes('://')
  ) {
    return null;
  }
  if (value.includes('\\') || /[\s<>"]/.test(value)) return null;
  return value;
}

function pickWorkSnapshot(work) {
  return {
    id: work.id,
    title: work.title,
    description: work.description || '',
    kind: work.kind,
    mediaUrl: work.mediaUrl || null,
    thumbnailUrl: work.thumbnailUrl || null,
    ctaLabel: work.ctaLabel || null,
    ctaUrl: work.ctaUrl || null,
    altText: work.altText || '',
    status: work.status,
    updatedAt: work.updatedAt || work.uploadedAt || null,
    sortOrder: work.sortOrder,
    provenance: work.provenance || null,
  };
}

function llmConfigured() {
  const a = String(process.env.ANTHROPIC_API_KEY || '').trim();
  const o = String(process.env.OPENAI_API_KEY || '').trim();
  return Boolean(a || o);
}

/**
 * Resolve canonical editing context for Performer bridge actions.
 */
export async function resolveBridgeContext(prisma, input) {
  assertBridgeEnabled();
  const section = String(input.section || 'shows').trim().toLowerCase() || 'shows';
  if (section !== 'shows') {
    throw httpError(400, 'unsupported_section', 'Phase 2 bridge currently supports section=shows only');
  }

  const context = await resolveWebsiteEditingContext(prisma, {
    storeId: input.storeId,
    draftId: input.draftId,
    revisionId: input.revisionId,
    generationRunId: input.generationRunId,
    userId: input.userId,
    user: input.user,
    adminSupport: Boolean(input.adminSupport),
    allowInit: input.allowInit !== false,
  });

  const storeId = context.storeId;
  const itemId = input.itemId != null ? String(input.itemId).trim() : '';
  let item = null;
  let relevanceWarning = null;
  const storeMeta = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, type: true, description: true, isActive: true },
  });

  if (itemId) {
    try {
      item = await getStoreShow(prisma, { storeId, workId: itemId });
      relevanceWarning = buildRelevanceWarning(item, storeMeta);
    } catch (err) {
      if (err?.code === 'show_not_found') {
        throw httpError(404, 'item_not_found', 'Show not found for this store');
      }
      throw err;
    }
  }

  const returnTo = sanitizeReturnTo(input.returnTo) || '/app';
  const reviewQuery = new URLSearchParams();
  reviewQuery.set('mode', 'draft');
  reviewQuery.set('websiteEditing', '1');
  reviewQuery.set('entry', context.adminSupport ? 'admin' : 'owner');
  reviewQuery.set('weKind', context.editingKind || 'unpublished_revision');
  reviewQuery.set('draftId', context.draftId);
  reviewQuery.set('section', 'shows');
  if (itemId) reviewQuery.set('itemId', itemId);
  reviewQuery.set('returnTo', returnTo);
  reviewQuery.set('contentBridge', '1');
  if (context.isPublishedStore) reviewQuery.set('committedStoreId', storeId);

  return {
    ok: true,
    bridge: 'performer_content_editing_v1',
    actorId: input.userId,
    storeId,
    storeName: context.storeName,
    draftId: context.draftId,
    revisionId: context.revisionId || context.draftId,
    generationRunId: context.generationRunId,
    editingKind: context.editingKind,
    isPublishedStore: context.isPublishedStore,
    adminSupport: Boolean(context.adminSupport),
    liveUnchanged: true,
    section: 'shows',
    item: item ? pickWorkSnapshot(item) : null,
    relevanceWarning,
    actions: {
      improveAutomatically: Boolean(item),
      editManually: true,
      hideNow: Boolean(item) && item.status !== 'ARCHIVED',
      reviewAll: true,
    },
    editManuallyUrl: `/app/store/${encodeURIComponent(storeId)}/review?${reviewQuery.toString()}`,
    returnTo,
  };
}

function applyScopeFields(current, proposed, scope, selectedFields) {
  const out = { ...current };
  const fields =
    scope === 'entire'
      ? EDITABLE_FIELDS
      : scope === 'title' || scope === 'relevance_title'
        ? ['title']
        : scope === 'description'
          ? ['description']
          : scope === 'image'
            ? ['mediaUrl', 'thumbnailUrl', 'altText']
            : scope === 'cta'
              ? ['ctaLabel', 'ctaUrl']
              : scope === 'selected' && Array.isArray(selectedFields)
                ? selectedFields.filter((f) => EDITABLE_FIELDS.includes(f))
                : ['title', 'description'];

  for (const f of fields) {
    if (proposed[f] !== undefined) out[f] = proposed[f];
  }
  // Never allow lifecycle via improve
  out.status = current.status;
  out.id = current.id;
  return out;
}

function buildDeterministicRelevanceProposal(work, store) {
  const storeName = (store?.name || 'this business').trim();
  const type = (store?.type || '').trim();
  const nextTitle = type
    ? `${storeName} — featured ${String(type).toLowerCase()}`
    : `${storeName} featured work`;
  return {
    title: nextTitle.slice(0, 120),
  };
}

/**
 * Create a Show improvement proposal (no mutation).
 */
export async function proposeShowImprovement(prisma, input) {
  assertBridgeEnabled();
  const scope = String(input.scope || 'selected').trim().toLowerCase();
  if (!ALLOWED_SCOPES.has(scope)) {
    throw httpError(400, 'invalid_scope', 'Unsupported improvement scope');
  }

  const bridge = await resolveBridgeContext(prisma, {
    ...input,
    section: 'shows',
  });
  if (!bridge.item) {
    throw httpError(400, 'item_required', 'itemId is required for automatic improvement');
  }

  const store = await prisma.business.findUnique({
    where: { id: bridge.storeId },
    select: { id: true, name: true, type: true, description: true },
  });

  let proposedPartial = null;
  let provider = 'none';
  let notConfigured = false;

  if (scope === 'relevance_title' || (bridge.relevanceWarning && scope === 'selected')) {
    proposedPartial = buildDeterministicRelevanceProposal(bridge.item, store);
    provider = 'deterministic_relevance';
  } else if (!llmConfigured()) {
    notConfigured = true;
  } else {
    // Narrow deterministic fallback when LLM keys exist but we avoid inventing free-form AI here:
    // only suggest altText from title if image scope; otherwise NotConfigured for free-form rewrite.
    if (scope === 'image' && bridge.item.title) {
      proposedPartial = {
        altText: `Image for ${bridge.item.title}`.slice(0, 160),
      };
      provider = 'deterministic_a11y';
    } else {
      notConfigured = true;
    }
  }

  if (notConfigured) {
    return {
      ok: true,
      status: 'not_configured',
      code: 'IMPROVE_NOT_CONFIGURED',
      message:
        'Automatic improvement is unavailable — no configured generation provider for this scope. You can edit manually instead.',
      bridge,
      actions: { editManually: true, hideNow: bridge.actions.hideNow },
    };
  }

  const after = applyScopeFields(bridge.item, proposedPartial, scope, input.selectedFields);
  const normalized = normalizeShowWork(after, bridge.item.sortOrder ?? 0);
  if (!normalized) {
    throw httpError(400, 'invalid_proposal', 'Proposed Show failed validation');
  }

  const proposalId = `prop_${randomUUID()}`;
  const proposal = {
    proposalId,
    storeId: bridge.storeId,
    draftId: bridge.draftId,
    revisionId: bridge.revisionId,
    itemId: bridge.item.id,
    section: 'shows',
    scope,
    provider,
    baseUpdatedAt: bridge.item.updatedAt,
    before: pickWorkSnapshot(bridge.item),
    after: pickWorkSnapshot(normalized),
    createdAt: new Date().toISOString(),
    actorId: input.userId,
    status: 'pending',
  };
  proposalStore.set(proposalId, proposal);

  return {
    ok: true,
    status: 'proposal_ready',
    proposal,
    bridge,
    published: false,
  };
}

/**
 * Accept a pending proposal with optimistic concurrency on item updatedAt.
 */
export async function acceptShowImprovement(prisma, input) {
  assertBridgeEnabled();
  const proposalId = String(input.proposalId || '').trim();
  const proposal = proposalStore.get(proposalId);
  if (!proposal || proposal.status !== 'pending') {
    throw httpError(404, 'proposal_not_found', 'Proposal not found or already handled');
  }
  if (proposal.storeId !== String(input.storeId || '').trim()) {
    throw httpError(403, 'cross_store_proposal', 'Proposal does not belong to this store');
  }
  if (proposal.actorId !== input.userId && !isPlatformAdmin(input.user)) {
    throw httpError(403, 'forbidden', 'You cannot accept this proposal');
  }

  const current = await getStoreShow(prisma, {
    storeId: proposal.storeId,
    workId: proposal.itemId,
  });
  const currentUpdated = current.updatedAt || current.uploadedAt || null;
  const expected =
    input.expectedUpdatedAt != null
      ? String(input.expectedUpdatedAt)
      : proposal.baseUpdatedAt;

  if (String(currentUpdated || '') !== String(expected || '')) {
    throw httpError(
      409,
      'concurrency_conflict',
      'This Show changed since the proposal was created. Review or regenerate.',
    );
  }

  const patch = { ...proposal.after };
  delete patch.status; // never publish via improve
  delete patch.id;

  const result = await upsertStoreShow(prisma, {
    storeId: proposal.storeId,
    workId: proposal.itemId,
    patch,
    actorId: input.userId,
    provenance: isPlatformAdmin(input.user) ? 'admin' : 'owner',
    reason: 'performer_bridge_accept_proposal',
  });

  proposal.status = 'accepted';
  proposalStore.set(proposalId, proposal);

  return {
    ok: true,
    status: 'applied',
    proposalId,
    published: false,
    item: result.works.find((w) => w.id === proposal.itemId) || null,
    draftId: proposal.draftId,
    revisionId: proposal.revisionId,
  };
}

export async function discardShowImprovement(input) {
  assertBridgeEnabled();
  const proposalId = String(input.proposalId || '').trim();
  const proposal = proposalStore.get(proposalId);
  if (!proposal) {
    return { ok: true, status: 'discarded' };
  }
  if (proposal.actorId !== input.userId && !isPlatformAdmin(input.user)) {
    throw httpError(403, 'forbidden', 'You cannot discard this proposal');
  }
  proposal.status = 'discarded';
  proposalStore.set(proposalId, proposal);
  return { ok: true, status: 'discarded', proposalId };
}

/**
 * Hide now — immediate lifecycle via existing Phase 1 mutation.
 */
export async function hideShowViaBridge(prisma, input) {
  assertBridgeEnabled();
  if (input.confirmed !== true) {
    throw httpError(400, 'confirmation_required', 'Set confirmed: true to hide this Show');
  }

  const bridge = await resolveBridgeContext(prisma, {
    ...input,
    section: 'shows',
  });
  if (!bridge.item) {
    throw httpError(400, 'item_required', 'itemId is required for Hide now');
  }

  const result = await setStoreShowStatus(prisma, {
    storeId: bridge.storeId,
    workId: bridge.item.id,
    status: 'HIDDEN',
    actorId: input.userId,
    reason: input.adminSupport ? 'admin_bridge_hide' : 'performer_bridge_hide',
  });

  const store = await prisma.business.findUnique({
    where: { id: bridge.storeId },
    select: { id: true, isActive: true },
  });
  if (store?.isActive) {
    try {
      await bumpPublicFeedRankForStore(prisma, store.id, { reason: 'performer_bridge_hide' });
    } catch {
      /* non-fatal */
    }
  }

  const updated = result.works.find((w) => w.id === bridge.item.id);
  return {
    ok: true,
    status: 'hidden',
    item: updated ? pickWorkSnapshot(updated) : null,
    storeId: bridge.storeId,
    draftId: bridge.draftId,
    published: false,
    archived: false,
  };
}

export async function listBridgeShowWarnings(prisma, input) {
  assertBridgeEnabled();
  const bridge = await resolveBridgeContext(prisma, {
    ...input,
    itemId: null,
    section: 'shows',
  });
  const { works } = await listStoreShows(prisma, {
    storeId: bridge.storeId,
    includeArchived: false,
  });
  const store = await prisma.business.findUnique({
    where: { id: bridge.storeId },
    select: { name: true, type: true, description: true },
  });
  const flagged = works
    .map((w) => ({
      ...pickWorkSnapshot(w),
      relevanceWarning: buildRelevanceWarning(w, store),
    }))
    .filter((w) => w.relevanceWarning);

  return {
    ok: true,
    storeId: bridge.storeId,
    draftId: bridge.draftId,
    revisionId: bridge.revisionId,
    editManuallyUrl: bridge.editManuallyUrl,
    works: flagged,
  };
}

/** Test helper */
export function _clearProposalStoreForTests() {
  proposalStore.clear();
}
