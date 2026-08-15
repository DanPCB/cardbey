import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getPrebuiltDraftById, getPreviewTokenByHash, savePreviewToken } from './draftRepository.js';
import type { PreviewTokenRecord } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function buildToken(): string {
  return randomBytes(24).toString('base64url');
}

function isExpired(record: PreviewTokenRecord, now = new Date()): boolean {
  return new Date(record.expiresAt).getTime() <= now.getTime();
}

function isRevoked(record: PreviewTokenRecord): boolean {
  return Boolean(record.revokedAt);
}

export async function createPreviewToken(params: {
  draftId: string;
  ttlMs?: number;
}): Promise<{ token: string; record: PreviewTokenRecord }> {
  const draft = await getPrebuiltDraftById(params.draftId);
  if (!draft) {
    throw new Error(`Prebuilt draft not found: ${params.draftId}`);
  }
  const token = buildToken();
  const now = new Date();
  const ttlMs = params.ttlMs ?? 24 * 60 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const record: PreviewTokenRecord = {
    id: randomUUID(),
    draftId: draft.id,
    tokenHash: hashOpaqueToken(token),
    expiresAt: expiresAt.toISOString(),
    revokedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await savePreviewToken(record);
  return { token, record };
}

export async function getPreviewTokenRecord(
  token: string,
): Promise<PreviewTokenRecord | null> {
  const record = await getPreviewTokenByHash(hashOpaqueToken(token));
  if (!record) return null;
  if (isRevoked(record) || isExpired(record)) {
    return null;
  }
  return record;
}

export async function revokePreviewToken(token: string): Promise<PreviewTokenRecord | null> {
  const record = await getPreviewTokenByHash(hashOpaqueToken(token));
  if (!record) return null;
  if (record.revokedAt) return record;
  const now = nowIso();
  const updated: PreviewTokenRecord = {
    ...record,
    revokedAt: now,
    updatedAt: now,
  };
  await savePreviewToken(updated);
  return updated;
}
