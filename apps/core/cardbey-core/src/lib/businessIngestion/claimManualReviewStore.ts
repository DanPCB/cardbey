/**
 * Manual review queue for claim enrichment-email mismatches (Phase 3 Guard B).
 * Soft gate — never hard-rejects the claimant.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

export type ClaimManualReviewReason = 'email_mismatch';

export interface ClaimManualReviewRecord {
  id: string;
  seedId: string;
  userId: string;
  claimRequestId: string | null;
  reason: ClaimManualReviewReason;
  claimantEmail: string;
  enrichmentEmail: string;
  status: 'pending' | 'resolved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  /** Claimant-facing message */
  message: string;
}

const CLAIMANT_REVIEW_MESSAGE =
  "Your claim is under review. We'll confirm within 24 hours.";

function storeDir(): string {
  return (
    process.env.BUSINESS_INGESTION_DIR ||
    path.join(CORE_ROOT, 'data', 'businessIngestion')
  );
}

function reviewsFile(): string {
  return path.join(storeDir(), 'claim-manual-reviews.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<ClaimManualReviewRecord[]> {
  try {
    const buf = await fs.readFile(reviewsFile(), 'utf8');
    const parsed = JSON.parse(buf);
    return Array.isArray(parsed) ? (parsed as ClaimManualReviewRecord[]) : [];
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return [];
    return [];
  }
}

async function writeAll(records: ClaimManualReviewRecord[]): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.claim-manual-reviews.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(records, null, 2), 'utf8');
  await fs.rename(tmp, reviewsFile());
}

/**
 * Create a reviewable admin-queue record. Does not throw to the claimant path.
 */
export async function flagForManualReview(params: {
  seedId: string;
  userId: string;
  claimRequestId?: string | null;
  reason: ClaimManualReviewReason;
  claimantEmail: string;
  enrichmentEmail: string;
}): Promise<ClaimManualReviewRecord> {
  const now = new Date().toISOString();
  const record: ClaimManualReviewRecord = {
    id: randomUUID(),
    seedId: params.seedId,
    userId: params.userId,
    claimRequestId: params.claimRequestId ?? null,
    reason: params.reason,
    claimantEmail: String(params.claimantEmail || '').trim().toLowerCase(),
    enrichmentEmail: String(params.enrichmentEmail || '').trim().toLowerCase(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    message: CLAIMANT_REVIEW_MESSAGE,
  };

  const op = writeChain.then(async () => {
    const all = await readAll();
    all.push(record);
    await writeAll(all);
    return record;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function listManualReviewQueue(
  filters: { status?: ClaimManualReviewRecord['status']; reason?: ClaimManualReviewReason } = {},
): Promise<ClaimManualReviewRecord[]> {
  const all = await readAll();
  return all.filter((r) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.reason && r.reason !== filters.reason) return false;
    return true;
  });
}

export function getClaimantReviewMessage(): string {
  return CLAIMANT_REVIEW_MESSAGE;
}

/** Test helper */
export async function resetManualReviewsForTests(): Promise<void> {
  const op = writeChain.then(() => writeAll([]));
  writeChain = op.catch(() => undefined);
  await op;
}
