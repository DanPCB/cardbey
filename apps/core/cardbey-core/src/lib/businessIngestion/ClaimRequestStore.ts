/**
 * Persist ingestion claim requests (V1.2).
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClaimProofType, IngestionClaimRequest } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir(): string {
  return (
    process.env.BUSINESS_INGESTION_DIR ||
    path.join(CORE_ROOT, 'data', 'businessIngestion')
  );
}

function claimsFile(): string {
  return path.join(storeDir(), 'claims.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<IngestionClaimRequest[]> {
  try {
    const buf = await fs.readFile(claimsFile(), 'utf8');
    const parsed = JSON.parse(buf);
    return Array.isArray(parsed) ? (parsed as IngestionClaimRequest[]) : [];
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return [];
    return [];
  }
}

async function writeAll(records: IngestionClaimRequest[]): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.claims.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(records, null, 2), 'utf8');
  await fs.rename(tmp, claimsFile());
}

export async function listClaimRequests(): Promise<IngestionClaimRequest[]> {
  return readAll();
}

export async function getClaimRequestById(id: string): Promise<IngestionClaimRequest | null> {
  const all = await readAll();
  return all.find((c) => c.id === id) ?? null;
}

const OPEN_CLAIM_STATUSES = new Set([
  'pending',
  'otp_sent',
  'proof_submitted',
  'verified',
  'pending_review',
]);

export async function getActiveClaimForSeed(
  seedId: string,
  claimantUserId: string,
): Promise<IngestionClaimRequest | null> {
  const all = await readAll();
  return (
    all.find(
      (c) =>
        c.seedId === seedId &&
        c.claimantUserId === claimantUserId &&
        OPEN_CLAIM_STATUSES.has(c.claimStatus),
    ) ?? null
  );
}

export async function getVerifiedClaimForSeed(
  seedId: string,
  claimantUserId?: string,
): Promise<IngestionClaimRequest | null> {
  const all = await readAll();
  return (
    all.find(
      (c) =>
        c.seedId === seedId &&
        c.claimStatus === 'verified' &&
        (!claimantUserId || c.claimantUserId === claimantUserId),
    ) ?? null
  );
}

export async function saveClaimRequest(claim: IngestionClaimRequest): Promise<IngestionClaimRequest> {
  const op = writeChain.then(async () => {
    const all = await readAll();
    const idx = all.findIndex((c) => c.id === claim.id);
    if (idx >= 0) all[idx] = claim;
    else all.push(claim);
    await writeAll(all);
    return claim;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function createClaimRequest(params: {
  seedId: string;
  claimantUserId: string;
  proofType: ClaimProofType;
  proofContact: string | null;
}): Promise<IngestionClaimRequest> {
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const claim: IngestionClaimRequest = {
    id: randomUUID(),
    seedId: params.seedId,
    claimantUserId: params.claimantUserId,
    proofType: params.proofType,
    proofContact: params.proofContact,
    proofStatus: 'pending',
    claimStatus: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt,
    attempts: 0,
    verifiedAt: null,
    rejectionReason: null,
    duplicateBlockedStoreId: null,
    claimStartedAt: nowIso,
  };
  return saveClaimRequest(claim);
}

export async function resetClaimRequestsForTests(): Promise<void> {
  const op = writeChain.then(() => writeAll([]));
  writeChain = op.catch(() => undefined);
  await op;
}
