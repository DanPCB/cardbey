/**
 * Performer Content Editing Bridge (Phase 2 + Phase 3 hardening).
 * Durable ContentEditProposal persistence, fingerprint concurrency, AuditEvent trail.
 */

import { createHash } from 'node:crypto';
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
import {
  createContentEditProposal,
  getContentEditProposal,
  updateContentEditProposal,
  markPendingProposalsStaleForItem,
  expireDueProposals,
  computeItemFingerprint,
  sanitizeSnapshotForStorage,
  getProposalStorageMode,
  claimPendingProposalForAccept,
  DEFAULT_FILE_ROOT,
  _resetFileProposalStoreForTests,
} from '../contentEditProposals/contentEditProposalRepository.js';

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

/** Bounded operational counters (no PII / content). */
const telemetry = {
  resolve_ok: 0,
  resolve_fail: 0,
  proposal_created: 0,
  proposal_accepted: 0,
  proposal_discarded: 0,
  proposal_expired: 0,
  proposal_stale: 0,
  concurrency_conflict: 0,
  permission_reject: 0,
  cross_store_reject: 0,
  hide_ok: 0,
  hide_fail: 0,
  provider_unavailable: 0,
  rate_limit_reject: 0,
};

export function getBridgeTelemetrySnapshot() {
  return { ...telemetry };
}

export function _resetBridgeTelemetryForTests() {
  for (const k of Object.keys(telemetry)) telemetry[k] = 0;
}

function bump(key) {
  if (telemetry[key] != null) telemetry[key] += 1;
}

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
    throw httpError(403, 'bridge_disabled', 'Performer content editing bridge is disabled');
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
  return sanitizeSnapshotForStorage({
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
  });
}

function llmConfigured() {
  return Boolean(
    String(process.env.ANTHROPIC_API_KEY || '').trim() ||
      String(process.env.OPENAI_API_KEY || '').trim(),
  );
}

async function writeAudit(prisma, {
  entityType,
  entityId,
  action,
  actorType,
  actorId,
  reason,
  fromStatus,
  toStatus,
  correlationId,
  metadata,
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        entityType,
        entityId: String(entityId),
        action,
        actorType,
        actorId: actorId || null,
        reason: reason || null,
        fromStatus: fromStatus || null,
        toStatus: toStatus || null,
        correlationId: correlationId || null,
        metadata: metadata || undefined,
      },
    });
  } catch {
    /* non-fatal */
  }
}

function actorTypeFor(input) {
  if (input.adminSupport) return 'admin';
  return 'human';
}

function requireAdminReason(input) {
  if (!input.adminSupport) return;
  const reason = typeof input.adminReason === 'string' ? input.adminReason.trim() : '';
  if (reason.length < 3) {
    bump('permission_reject');
    throw httpError(
      400,
      'admin_reason_required',
      'Admin-assisted changes require a reason (min 3 characters)',
    );
  }
}

/**
 * Resolve canonical editing context for Performer bridge actions.
 */
export async function resolveBridgeContext(prisma, input) {
  assertBridgeEnabled();
  const section = String(input.section || 'shows').trim().toLowerCase() || 'shows';
  if (section !== 'shows') {
    bump('resolve_fail');
    throw httpError(400, 'unsupported_section', 'Phase 2 bridge currently supports section=shows only');
  }

  if (input.adminSupport) {
    if (!isPlatformAdmin(input.user)) {
      bump('permission_reject');
      throw httpError(403, 'forbidden', 'Admin support requires platform admin');
    }
  }

  let context;
  try {
    context = await resolveWebsiteEditingContext(prisma, {
      storeId: input.storeId,
      draftId: input.draftId,
      revisionId: input.revisionId,
      generationRunId: input.generationRunId,
      userId: input.userId,
      user: input.user,
      adminSupport: Boolean(input.adminSupport),
      allowInit: input.allowInit !== false,
    });
  } catch (err) {
    bump('resolve_fail');
    if (err?.code === 'cross_store_draft' || err?.code === 'forbidden') bump('cross_store_reject');
    throw err;
  }

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
      bump('resolve_fail');
      if (err?.code === 'show_not_found') {
        bump('cross_store_reject');
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

  bump('resolve_ok');
  await writeAudit(prisma, {
    entityType: 'Business',
    entityId: storeId,
    action: 'content_bridge_resolve',
    actorType: actorTypeFor(input),
    actorId: input.userId,
    reason: input.adminReason || 'bridge_resolve',
    correlationId: context.draftId,
    metadata: {
      contentType: 'shows',
      itemId: itemId || null,
      adminSupport: Boolean(input.adminSupport),
      result: 'ok',
    },
  });

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
    itemFingerprint: item ? computeItemFingerprint(pickWorkSnapshot(item)) : null,
    relevanceWarning,
    actions: {
      improveAutomatically: Boolean(item),
      editManually: true,
      hideNow: Boolean(item) && item.status !== 'ARCHIVED',
      reviewAll: true,
    },
    editManuallyUrl: `/app/store/${encodeURIComponent(storeId)}/review?${reviewQuery.toString()}`,
    returnTo,
    proposalStorageMode: getProposalStorageMode(prisma),
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
  out.status = current.status;
  out.id = current.id;
  return { next: out, scopedFields: fields };
}

function buildDeterministicRelevanceProposal(work, store) {
  const storeName = (store?.name || 'this business').trim();
  const type = (store?.type || '').trim();
  const nextTitle = type
    ? `${storeName} — featured ${String(type).toLowerCase()}`
    : `${storeName} featured work`;
  return { title: nextTitle.slice(0, 120) };
}

function fileOpts(input) {
  return input?.fileRoot ? { fileRoot: input.fileRoot } : {};
}

/**
 * Create a Show improvement proposal (no mutation of store content).
 */
export async function proposeShowImprovement(prisma, input) {
  assertBridgeEnabled();
  if (input.adminSupport) requireAdminReason(input);

  const scope = String(input.scope || 'selected').trim().toLowerCase();
  if (!ALLOWED_SCOPES.has(scope)) {
    throw httpError(400, 'invalid_scope', 'Unsupported improvement scope');
  }

  await expireDueProposals(prisma, new Date(), fileOpts(input));

  const bridge = await resolveBridgeContext(prisma, { ...input, section: 'shows' });
  if (!bridge.item) {
    throw httpError(400, 'item_required', 'itemId is required for automatic improvement');
  }

  const store = await prisma.business.findUnique({
    where: { id: bridge.storeId },
    select: { id: true, name: true, type: true, description: true },
  });

  let proposedPartial = null;
  let providerMethod = 'none';
  let notConfigured = false;

  if (scope === 'relevance_title' || (bridge.relevanceWarning && scope === 'selected')) {
    proposedPartial = buildDeterministicRelevanceProposal(bridge.item, store);
    providerMethod = 'deterministic_relevance';
  } else if (!llmConfigured()) {
    notConfigured = true;
  } else if (scope === 'image' && bridge.item.title) {
    proposedPartial = { altText: `Image for ${bridge.item.title}`.slice(0, 160) };
    providerMethod = 'deterministic_a11y';
  } else {
    notConfigured = true;
  }

  if (notConfigured) {
    bump('provider_unavailable');
    await writeAudit(prisma, {
      entityType: 'Business',
      entityId: bridge.storeId,
      action: 'content_bridge_propose',
      actorType: actorTypeFor(input),
      actorId: input.userId,
      reason: 'not_configured',
      metadata: {
        contentType: 'shows',
        itemId: bridge.item.id,
        result: 'not_configured',
        providerMethod: 'not_configured',
      },
    });
    return {
      ok: true,
      status: 'not_configured',
      code: 'IMPROVE_NOT_CONFIGURED',
      message:
        'Automatic improvement is unavailable — no configured generation provider for this scope. You can edit manually instead.',
      bridge,
      providerMethod: 'not_configured',
      actions: { editManually: true, hideNow: bridge.actions.hideNow },
    };
  }

  const { next, scopedFields } = applyScopeFields(
    bridge.item,
    proposedPartial,
    scope,
    input.selectedFields,
  );
  const normalized = normalizeShowWork(next, bridge.item.sortOrder ?? 0);
  if (!normalized) {
    throw httpError(400, 'invalid_proposal', 'Proposed Show failed validation');
  }

  const before = pickWorkSnapshot(bridge.item);
  const after = pickWorkSnapshot(normalized);
  const baseFingerprint = computeItemFingerprint(before);

  // Supersede older pending proposals for same item (explicit canonical rule)
  await markPendingProposalsStaleForItem(
    prisma,
    {
      storeId: bridge.storeId,
      contentType: 'shows',
      contentItemId: bridge.item.id,
      reason: 'superseded_by_new_proposal',
    },
    fileOpts(input),
  );

  const proposal = await createContentEditProposal(
    prisma,
    {
      actorId: input.userId,
      storeId: bridge.storeId,
      draftId: bridge.draftId,
      revisionId: bridge.revisionId,
      contentType: 'shows',
      contentItemId: bridge.item.id,
      scopedFields,
      baseFingerprint,
      baseUpdatedAt: before.updatedAt,
      proposedPatch: proposedPartial,
      before,
      after,
      providerMethod,
      adminReason: input.adminSupport ? input.adminReason : null,
      correlationId: bridge.draftId,
    },
    fileOpts(input),
  );

  bump('proposal_created');
  await writeAudit(prisma, {
    entityType: 'ContentEditProposal',
    entityId: proposal.proposalId,
    action: 'content_bridge_propose',
    actorType: actorTypeFor(input),
    actorId: input.userId,
    reason: input.adminReason || 'propose',
    toStatus: 'PENDING',
    correlationId: bridge.draftId,
    metadata: {
      storeId: bridge.storeId,
      contentType: 'shows',
      itemId: bridge.item.id,
      providerMethod,
      baseFingerprint,
      result: 'ok',
      adminSupport: Boolean(input.adminSupport),
    },
  });

  return {
    ok: true,
    status: 'proposal_ready',
    proposal: {
      proposalId: proposal.proposalId,
      storeId: proposal.storeId,
      draftId: proposal.draftId,
      revisionId: proposal.revisionId,
      itemId: proposal.contentItemId,
      section: 'shows',
      scope,
      provider: providerMethod,
      providerMethod,
      baseUpdatedAt: proposal.baseUpdatedAt,
      baseFingerprint: proposal.baseFingerprint,
      before: proposal.before,
      after: proposal.after,
      status: proposal.status,
      expiresAt: proposal.expiresAt,
      createdAt: proposal.createdAt,
    },
    bridge,
    published: false,
  };
}

/**
 * Accept a pending durable proposal with fingerprint + updatedAt concurrency.
 * Idempotent: re-accept of already ACCEPTED by same actor returns applied.
 */
export async function acceptShowImprovement(prisma, input) {
  assertBridgeEnabled();
  if (input.adminSupport) requireAdminReason(input);

  await expireDueProposals(prisma, new Date(), fileOpts(input));

  const proposalId = String(input.proposalId || '').trim();
  const proposal = await getContentEditProposal(prisma, proposalId, fileOpts(input));
  if (!proposal) {
    throw httpError(404, 'proposal_not_found', 'Proposal not found');
  }

  // Binding checks — never leak other tenant content
  if (proposal.storeId !== String(input.storeId || '').trim()) {
    bump('cross_store_reject');
    throw httpError(403, 'cross_store_proposal', 'Proposal does not belong to this store');
  }
  const isAdmin = isPlatformAdmin(input.user);
  if (proposal.actorId !== input.userId && !(input.adminSupport && isAdmin)) {
    bump('permission_reject');
    throw httpError(403, 'forbidden', 'You cannot accept this proposal');
  }
  // Admin cannot accept another actor's private proposal unless explicitly adminSupport
  if (proposal.actorId !== input.userId && !input.adminSupport) {
    bump('permission_reject');
    throw httpError(403, 'forbidden', 'You cannot accept this proposal');
  }

  if (proposal.status === 'ACCEPTED') {
    return {
      ok: true,
      status: 'applied',
      idempotent: true,
      proposalId,
      published: false,
      item: proposal.after,
      draftId: proposal.draftId,
      revisionId: proposal.revisionId,
      appliedRevisionId: proposal.appliedRevisionId,
    };
  }

  if (proposal.status === 'DISCARDED') {
    throw httpError(409, 'proposal_discarded', 'Proposal was discarded');
  }
  if (proposal.status === 'EXPIRED' || new Date(proposal.expiresAt).getTime() < Date.now()) {
    if (proposal.status === 'PENDING') {
      await updateContentEditProposal(prisma, proposalId, { status: 'EXPIRED' }, fileOpts(input));
      bump('proposal_expired');
    }
    throw httpError(409, 'proposal_expired', 'Proposal has expired');
  }
  if (proposal.status === 'STALE') {
    bump('proposal_stale');
    throw httpError(409, 'proposal_stale', 'Proposal is stale after a later content change');
  }
  if (proposal.status !== 'PENDING') {
    throw httpError(409, 'proposal_not_pending', `Proposal status is ${proposal.status}`);
  }

  const applyOnce = async () => {
    const current = await getStoreShow(prisma, {
      storeId: proposal.storeId,
      workId: proposal.contentItemId,
    });
    const currentSnap = pickWorkSnapshot(current);
    const currentFp = computeItemFingerprint(currentSnap);
    const expectedFp = String(input.expectedFingerprint || proposal.baseFingerprint);
    const expectedUpdated =
      input.expectedUpdatedAt != null
        ? String(input.expectedUpdatedAt)
        : proposal.baseUpdatedAt;

    if (
      currentFp !== expectedFp ||
      String(currentSnap.updatedAt || '') !== String(expectedUpdated || '')
    ) {
      await updateContentEditProposal(prisma, proposalId, { status: 'STALE' }, fileOpts(input));
      bump('concurrency_conflict');
      bump('proposal_stale');
      await writeAudit(prisma, {
        entityType: 'ContentEditProposal',
        entityId: proposalId,
        action: 'content_bridge_accept',
        actorType: actorTypeFor(input),
        actorId: input.userId,
        reason: 'concurrency_conflict',
        fromStatus: 'PENDING',
        toStatus: 'STALE',
        metadata: {
          storeId: proposal.storeId,
          itemId: proposal.contentItemId,
          result: 'concurrency_conflict',
        },
      });
      throw httpError(
        409,
        'concurrency_conflict',
        'This Show changed since the proposal was created. Review or regenerate.',
      );
    }

    const patch = { ...proposal.proposedPatch };
    delete patch.status;
    delete patch.id;

    // CAS: only one concurrent accept may claim PENDING → ACCEPTED
    const claimed = await claimPendingProposalForAccept(prisma, proposalId, fileOpts(input));
    if (!claimed) {
      const again = await getContentEditProposal(prisma, proposalId, fileOpts(input));
      if (again?.status === 'ACCEPTED') {
        return {
          ok: true,
          status: 'applied',
          idempotent: true,
          proposalId,
          published: false,
          item: again.after,
          draftId: again.draftId,
          revisionId: again.revisionId,
          appliedRevisionId: again.appliedRevisionId,
        };
      }
      bump('concurrency_conflict');
      throw httpError(409, 'concurrency_conflict', 'Proposal was claimed by another request');
    }

    let result;
    try {
      result = await upsertStoreShow(prisma, {
        storeId: proposal.storeId,
        workId: proposal.contentItemId,
        patch,
        actorId: input.userId,
        provenance: input.adminSupport ? 'admin' : 'owner',
        reason: input.adminSupport
          ? `admin_bridge_accept:${input.adminReason}`
          : 'performer_bridge_accept_proposal',
      });
    } catch (err) {
      await updateContentEditProposal(
        prisma,
        proposalId,
        { status: 'FAILED', acceptedAt: null },
        fileOpts(input),
      );
      throw err;
    }

    const updated = result.works.find((w) => w.id === proposal.contentItemId) || null;
    const accepted = await updateContentEditProposal(
      prisma,
      proposalId,
      {
        appliedRevisionId: proposal.revisionId || proposal.draftId,
      },
      fileOpts(input),
    );

    bump('proposal_accepted');
    await writeAudit(prisma, {
      entityType: 'ContentEditProposal',
      entityId: proposalId,
      action: 'content_bridge_accept',
      actorType: actorTypeFor(input),
      actorId: input.userId,
      reason: input.adminReason || 'accept',
      fromStatus: 'PENDING',
      toStatus: 'ACCEPTED',
      correlationId: proposal.draftId,
      metadata: {
        storeId: proposal.storeId,
        contentType: 'shows',
        itemId: proposal.contentItemId,
        providerMethod: proposal.providerMethod,
        beforeFingerprint: proposal.baseFingerprint,
        afterFingerprint: updated ? computeItemFingerprint(pickWorkSnapshot(updated)) : null,
        result: 'ok',
        adminSupport: Boolean(input.adminSupport),
      },
    });

    return {
      ok: true,
      status: 'applied',
      idempotent: false,
      proposalId,
      published: false,
      item: updated ? pickWorkSnapshot(updated) : null,
      draftId: proposal.draftId,
      revisionId: proposal.revisionId,
      appliedRevisionId: accepted.appliedRevisionId,
      itemFingerprint: updated ? computeItemFingerprint(pickWorkSnapshot(updated)) : null,
    };
  };

  return applyOnce();
}

export async function discardShowImprovement(prisma, input) {
  assertBridgeEnabled();
  const proposalId = String(input.proposalId || '').trim();
  const proposal = await getContentEditProposal(prisma, proposalId, fileOpts(input));
  if (!proposal) {
    return { ok: true, status: 'discarded' };
  }
  if (proposal.storeId !== String(input.storeId || proposal.storeId).trim() && input.storeId) {
    if (proposal.storeId !== String(input.storeId).trim()) {
      bump('cross_store_reject');
      throw httpError(403, 'cross_store_proposal', 'Proposal does not belong to this store');
    }
  }
  if (proposal.actorId !== input.userId && !(input.adminSupport && isPlatformAdmin(input.user))) {
    bump('permission_reject');
    throw httpError(403, 'forbidden', 'You cannot discard this proposal');
  }
  if (proposal.status === 'DISCARDED') {
    return { ok: true, status: 'discarded', proposalId, idempotent: true };
  }
  if (proposal.status === 'ACCEPTED') {
    throw httpError(409, 'proposal_already_accepted', 'Accepted proposals cannot be discarded');
  }
  await updateContentEditProposal(
    prisma,
    proposalId,
    { status: 'DISCARDED', discardedAt: new Date() },
    fileOpts(input),
  );
  bump('proposal_discarded');
  await writeAudit(prisma, {
    entityType: 'ContentEditProposal',
    entityId: proposalId,
    action: 'content_bridge_discard',
    actorType: actorTypeFor(input),
    actorId: input.userId,
    reason: input.adminReason || 'discard',
    fromStatus: proposal.status,
    toStatus: 'DISCARDED',
    metadata: {
      storeId: proposal.storeId,
      itemId: proposal.contentItemId,
      result: 'ok',
    },
  });
  return { ok: true, status: 'discarded', proposalId };
}

export async function hideShowViaBridge(prisma, input) {
  assertBridgeEnabled();
  if (input.confirmed !== true) {
    bump('hide_fail');
    throw httpError(400, 'confirmation_required', 'Set confirmed: true to hide this Show');
  }
  if (input.adminSupport) requireAdminReason(input);

  const bridge = await resolveBridgeContext(prisma, { ...input, section: 'shows' });
  if (!bridge.item) {
    bump('hide_fail');
    throw httpError(400, 'item_required', 'itemId is required for Hide now');
  }

  const result = await setStoreShowStatus(prisma, {
    storeId: bridge.storeId,
    workId: bridge.item.id,
    status: 'HIDDEN',
    actorId: input.userId,
    reason: input.adminSupport
      ? `admin_bridge_hide:${input.adminReason}`
      : 'performer_bridge_hide',
  });

  await markPendingProposalsStaleForItem(
    prisma,
    {
      storeId: bridge.storeId,
      contentType: 'shows',
      contentItemId: bridge.item.id,
      reason: 'item_hidden',
    },
    fileOpts(input),
  );

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
  bump('hide_ok');
  await writeAudit(prisma, {
    entityType: 'Business',
    entityId: bridge.storeId,
    action: 'content_bridge_hide',
    actorType: actorTypeFor(input),
    actorId: input.userId,
    reason: input.adminReason || 'hide',
    toStatus: 'HIDDEN',
    correlationId: bridge.draftId,
    metadata: {
      contentType: 'shows',
      itemId: bridge.item.id,
      result: 'ok',
      adminSupport: Boolean(input.adminSupport),
    },
  });

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

/**
 * Non-mutating pilot readiness check.
 * Never claims READY_FOR_STAGING_PILOT from local-only evidence.
 * File mode → READY_FOR_LOCAL at best. Missing Prisma in non-local → BLOCKED.
 */
export async function getBridgeReadiness(prisma) {
  const flagOn = isPerformerContentEditingBridgeEnabled();
  const storageMode = getProposalStorageMode(prisma);
  let auditOk = false;
  try {
    auditOk = typeof prisma?.auditEvent?.create === 'function';
  } catch {
    auditOk = false;
  }
  const providerMode = llmConfigured()
    ? 'deterministic_plus_keys_present'
    : 'deterministic_only_or_not_configured';
  const showsOk = typeof setStoreShowStatus === 'function';
  const resolverOk = typeof resolveWebsiteEditingContext === 'function';
  const prismaMode = storageMode === 'prisma_content_edit_proposal';
  const fileLocalMode = storageMode === 'file_content_edit_proposal_local_only';
  const durable = prismaMode || fileLocalMode;
  const stagingDeclared =
    String(process.env.CARDBEY_CONTENT_BRIDGE_STAGING_DECLARED || '').trim() === '1';

  let overall = 'NOT_CONFIGURED';
  if (storageMode === 'unavailable') {
    overall = 'BLOCKED';
  } else if (!auditOk || !showsOk || !resolverOk) {
    overall = durable ? 'BLOCKED' : 'NOT_CONFIGURED';
  } else if (prismaMode && stagingDeclared && flagOn) {
    // Explicit operator declaration after staging migrate + browser verification — not automatic
    overall = 'READY_FOR_STAGING_PILOT';
  } else if (durable) {
    overall = 'READY_FOR_LOCAL';
  } else {
    overall = 'NOT_CONFIGURED';
  }

  return {
    ok: true,
    overall,
    coreFlagEnabled: flagOn,
    dashboardFlagDoc: 'VITE_ENABLE_PERFORMER_CONTENT_EDITING_BRIDGE_V1 (default false)',
    proposalStorageMode: storageMode,
    durableProposals: durable,
    fileFallbackLocalOnly: true,
    prismaPersistenceRequiredForStaging: true,
    stagingDeclared,
    auditAvailable: auditOk,
    providerMode,
    rateLimiter: 'middleware.rateLimit',
    showsMutationAvailable: showsOk,
    resolverAvailable: resolverOk,
    cacheInvalidation: 'bumpPublicFeedRankForStore',
    telemetry: getBridgeTelemetrySnapshot(),
  };
}

export function _clearProposalStoreForTests(fileRoot = DEFAULT_FILE_ROOT) {
  _resetFileProposalStoreForTests(fileRoot);
}

export { computeItemFingerprint, DEFAULT_FILE_ROOT };
