/**
 * Durable ContentEditProposal repository.
 *
 * Preferred: Prisma `ContentEditProposal` (sqlite + postgres).
 * File fallback under data/contentEditProposals is LOCAL / TEST / single-process only.
 * Staging and production MUST use Prisma — missing delegate fails closed (no silent file fallback).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Local/test only — never commit runtime proposal JSON. */
const DEFAULT_FILE_ROOT = path.resolve(__dirname, '../../../data/contentEditProposals');

export const PROPOSAL_STATUSES = Object.freeze([
  'PENDING',
  'ACCEPTED',
  'DISCARDED',
  'EXPIRED',
  'STALE',
  'FAILED',
]);

export const DEFAULT_PROPOSAL_TTL_MS = 60 * 60 * 1000; // 1 hour

function httpError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

export function computeItemFingerprint(snapshot) {
  const payload = {
    id: snapshot?.id ?? null,
    title: snapshot?.title ?? '',
    description: snapshot?.description ?? '',
    kind: snapshot?.kind ?? null,
    mediaUrl: snapshot?.mediaUrl ?? null,
    thumbnailUrl: snapshot?.thumbnailUrl ?? null,
    ctaLabel: snapshot?.ctaLabel ?? null,
    ctaUrl: snapshot?.ctaUrl ?? null,
    altText: snapshot?.altText ?? '',
    status: snapshot?.status ?? null,
    sortOrder: snapshot?.sortOrder ?? null,
    updatedAt: snapshot?.updatedAt ?? null,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Public-safe snapshot — strip query tokens; no secrets/prompts. */
export function sanitizeSnapshotForStorage(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return {};
  return {
    id: snapshot.id,
    title: snapshot.title,
    description: snapshot.description || '',
    kind: snapshot.kind,
    mediaUrl: typeof snapshot.mediaUrl === 'string' ? snapshot.mediaUrl.split('?')[0] : null,
    thumbnailUrl:
      typeof snapshot.thumbnailUrl === 'string' ? snapshot.thumbnailUrl.split('?')[0] : null,
    ctaLabel: snapshot.ctaLabel || null,
    ctaUrl: snapshot.ctaUrl || null,
    altText: snapshot.altText || '',
    status: snapshot.status,
    updatedAt: snapshot.updatedAt || null,
    sortOrder: snapshot.sortOrder,
  };
}

export function hasPrismaDelegate(prisma) {
  return Boolean(prisma?.contentEditProposal?.create);
}

/**
 * File fallback allowed only for:
 * - NODE_ENV=test
 * - explicit CONTENT_EDIT_PROPOSAL_FILE_FALLBACK=1
 * - NODE_ENV=development (local single-process)
 * Never for staging/production (fail closed).
 */
export function isFileProposalFallbackAllowed(opts = {}) {
  if (opts.forceFile === true) return true; // unit tests with isolated fileRoot
  if (String(process.env.CONTENT_EDIT_PROPOSAL_FILE_FALLBACK || '').trim() === '1') return true;
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'test') return true;
  if (nodeEnv === 'development') return true;
  // Treat empty NODE_ENV as local-dev only when not on Render/staging deploy markers
  const deploy = String(
    process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || process.env.NODE_ENV || '',
  )
    .trim()
    .toLowerCase();
  if (deploy.includes('staging') || deploy.includes('prod') || nodeEnv === 'production') {
    return false;
  }
  if (!nodeEnv) return true; // bare local process
  return false;
}

export function assertProposalStorageAvailable(prisma, opts = {}) {
  if (hasPrismaDelegate(prisma)) return 'prisma';
  if (isFileProposalFallbackAllowed(opts) || opts.fileRoot) {
    return 'file';
  }
  throw httpError(
    503,
    'proposal_storage_unavailable',
    'ContentEditProposal database persistence is required. File fallback is disabled outside local/test.',
  );
}

function filePathFor(id, root = DEFAULT_FILE_ROOT) {
  return path.join(root, `${id}.json`);
}

function ensureDir(root = DEFAULT_FILE_ROOT) {
  fs.mkdirSync(root, { recursive: true });
}

function rowToProposal(row) {
  if (!row) return null;
  return {
    proposalId: row.id,
    actorId: row.actorId,
    storeId: row.storeId,
    draftId: row.draftId || null,
    revisionId: row.revisionId || null,
    contentType: row.contentType,
    contentItemId: row.contentItemId,
    scopedFields: JSON.parse(row.scopedFieldsJson || '[]'),
    baseFingerprint: row.baseFingerprint,
    baseUpdatedAt: row.baseUpdatedAt || null,
    proposedPatch: JSON.parse(row.proposedPatchJson || '{}'),
    before: JSON.parse(row.beforeSnapshotJson || '{}'),
    after: JSON.parse(row.afterSnapshotJson || '{}'),
    providerMethod: row.providerMethod,
    status: row.status,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt),
    acceptedAt: row.acceptedAt
      ? row.acceptedAt instanceof Date
        ? row.acceptedAt.toISOString()
        : String(row.acceptedAt)
      : null,
    discardedAt: row.discardedAt
      ? row.discardedAt instanceof Date
        ? row.discardedAt.toISOString()
        : String(row.discardedAt)
      : null,
    appliedRevisionId: row.appliedRevisionId || null,
    adminReason: row.adminReason || null,
    correlationId: row.correlationId || null,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ''),
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ''),
  };
}

function useFileStore(prisma, opts) {
  assertProposalStorageAvailable(prisma, opts);
  return !hasPrismaDelegate(prisma);
}

export async function createContentEditProposal(prisma, data, opts = {}) {
  assertProposalStorageAvailable(prisma, opts);
  const id = data.id || `cep_${randomUUID()}`;
  const now = new Date();
  const ttlMs = opts.ttlMs ?? DEFAULT_PROPOSAL_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const row = {
    id,
    actorId: data.actorId,
    storeId: data.storeId,
    draftId: data.draftId || null,
    revisionId: data.revisionId || null,
    contentType: data.contentType,
    contentItemId: data.contentItemId,
    scopedFieldsJson: JSON.stringify(data.scopedFields || []),
    baseFingerprint: data.baseFingerprint,
    baseUpdatedAt: data.baseUpdatedAt || null,
    proposedPatchJson: JSON.stringify(data.proposedPatch || {}),
    beforeSnapshotJson: JSON.stringify(sanitizeSnapshotForStorage(data.before || {})),
    afterSnapshotJson: JSON.stringify(sanitizeSnapshotForStorage(data.after || {})),
    providerMethod: data.providerMethod,
    status: 'PENDING',
    expiresAt,
    acceptedAt: null,
    discardedAt: null,
    appliedRevisionId: null,
    adminReason: data.adminReason || null,
    correlationId: data.correlationId || null,
    createdAt: now,
    updatedAt: now,
  };

  if (hasPrismaDelegate(prisma)) {
    const created = await prisma.contentEditProposal.create({ data: row });
    return rowToProposal(created);
  }

  const root = opts.fileRoot || DEFAULT_FILE_ROOT;
  ensureDir(root);
  fs.writeFileSync(filePathFor(id, root), JSON.stringify(row, null, 2), 'utf8');
  return rowToProposal(row);
}

export async function getContentEditProposal(prisma, proposalId, opts = {}) {
  assertProposalStorageAvailable(prisma, opts);
  if (hasPrismaDelegate(prisma)) {
    const row = await prisma.contentEditProposal.findUnique({ where: { id: proposalId } });
    return rowToProposal(row);
  }
  const root = opts.fileRoot || DEFAULT_FILE_ROOT;
  const fp = filePathFor(proposalId, root);
  if (!fs.existsSync(fp)) return null;
  return rowToProposal(JSON.parse(fs.readFileSync(fp, 'utf8')));
}

export async function claimPendingProposalForAccept(prisma, proposalId, opts = {}) {
  assertProposalStorageAvailable(prisma, opts);
  const now = new Date();
  if (hasPrismaDelegate(prisma)) {
    const result = await prisma.contentEditProposal.updateMany({
      where: { id: proposalId, status: 'PENDING' },
      data: {
        status: 'ACCEPTED',
        acceptedAt: now,
        updatedAt: now,
      },
    });
    if (result.count !== 1) return null;
    return getContentEditProposal(prisma, proposalId, opts);
  }
  const root = opts.fileRoot || DEFAULT_FILE_ROOT;
  const fp = filePathFor(proposalId, root);
  if (!fs.existsSync(fp)) return null;
  const row = JSON.parse(fs.readFileSync(fp, 'utf8'));
  if (row.status !== 'PENDING') return null;
  row.status = 'ACCEPTED';
  row.acceptedAt = now.toISOString();
  row.updatedAt = now.toISOString();
  fs.writeFileSync(fp, JSON.stringify(row, null, 2), 'utf8');
  return rowToProposal(row);
}

export async function updateContentEditProposal(prisma, proposalId, patch, opts = {}) {
  assertProposalStorageAvailable(prisma, opts);
  if (hasPrismaDelegate(prisma)) {
    const data = { ...patch, updatedAt: new Date() };
    const row = await prisma.contentEditProposal.update({ where: { id: proposalId }, data });
    return rowToProposal(row);
  }
  const root = opts.fileRoot || DEFAULT_FILE_ROOT;
  const fp = filePathFor(proposalId, root);
  if (!fs.existsSync(fp)) return null;
  const row = JSON.parse(fs.readFileSync(fp, 'utf8'));
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  fs.writeFileSync(fp, JSON.stringify(row, null, 2), 'utf8');
  return rowToProposal(row);
}

export async function listPendingProposalsForItem(
  prisma,
  { storeId, contentType, contentItemId },
  opts = {},
) {
  assertProposalStorageAvailable(prisma, opts);
  if (hasPrismaDelegate(prisma)) {
    const rows = await prisma.contentEditProposal.findMany({
      where: { storeId, contentType, contentItemId, status: 'PENDING' },
    });
    return rows.map(rowToProposal);
  }
  const root = opts.fileRoot || DEFAULT_FILE_ROOT;
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith('.json')) continue;
    const row = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
    if (
      row.storeId === storeId &&
      row.contentType === contentType &&
      row.contentItemId === contentItemId &&
      row.status === 'PENDING'
    ) {
      out.push(rowToProposal(row));
    }
  }
  return out;
}

export async function markPendingProposalsStaleForItem(
  prisma,
  { storeId, contentType, contentItemId, reason = 'item_changed' },
  opts = {},
) {
  const pending = await listPendingProposalsForItem(
    prisma,
    { storeId, contentType, contentItemId },
    opts,
  );
  const results = [];
  for (const p of pending) {
    results.push(
      await updateContentEditProposal(prisma, p.proposalId, { status: 'STALE' }, opts),
    );
  }
  return { count: results.length, reason };
}

export async function expireDueProposals(prisma, now = new Date(), opts = {}) {
  assertProposalStorageAvailable(prisma, opts);
  if (hasPrismaDelegate(prisma)) {
    const result = await prisma.contentEditProposal.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      data: { status: 'EXPIRED', updatedAt: now },
    });
    return { count: result.count };
  }
  const root = opts.fileRoot || DEFAULT_FILE_ROOT;
  if (!fs.existsSync(root)) return { count: 0 };
  let count = 0;
  const nowMs = now.getTime();
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith('.json')) continue;
    const fp = path.join(root, name);
    const row = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (row.status !== 'PENDING') continue;
    if (new Date(row.expiresAt).getTime() < nowMs) {
      row.status = 'EXPIRED';
      row.updatedAt = now.toISOString();
      fs.writeFileSync(fp, JSON.stringify(row, null, 2), 'utf8');
      count += 1;
    }
  }
  return { count };
}

export function getProposalStorageMode(prisma) {
  if (hasPrismaDelegate(prisma)) return 'prisma_content_edit_proposal';
  if (isFileProposalFallbackAllowed() || process.env.NODE_ENV === 'test') {
    return 'file_content_edit_proposal_local_only';
  }
  return 'unavailable';
}

/** Test helper — wipe file store directory */
export function _resetFileProposalStoreForTests(fileRoot = DEFAULT_FILE_ROOT) {
  if (!fs.existsSync(fileRoot)) return;
  for (const name of fs.readdirSync(fileRoot)) {
    if (name.endsWith('.json')) fs.unlinkSync(path.join(fileRoot, name));
  }
}

export { DEFAULT_FILE_ROOT, useFileStore };
