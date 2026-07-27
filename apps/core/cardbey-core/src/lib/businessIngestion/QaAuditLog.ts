/**
 * QA promotion audit log (V1.1).
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QaAuditEntry, QaPromotionAction, SeedVerificationStatus } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir(): string {
  return (
    process.env.BUSINESS_INGESTION_DIR ||
    path.join(CORE_ROOT, 'data', 'businessIngestion')
  );
}

function auditFile(): string {
  return path.join(storeDir(), 'qa-audit.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<QaAuditEntry[]> {
  try {
    const buf = await fs.readFile(auditFile(), 'utf8');
    const parsed = JSON.parse(buf);
    return Array.isArray(parsed) ? (parsed as QaAuditEntry[]) : [];
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return [];
    return [];
  }
}

async function writeAll(entries: QaAuditEntry[]): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.qa-audit.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(entries, null, 2), 'utf8');
  await fs.rename(tmp, auditFile());
}

export async function appendQaAuditEntry(params: {
  seedId: string;
  previousStatus: SeedVerificationStatus;
  nextStatus: SeedVerificationStatus;
  action: QaPromotionAction;
  reviewerId: string;
  reason?: string | null;
  canonicalSeedId?: string | null;
}): Promise<QaAuditEntry> {
  const entry: QaAuditEntry = {
    id: randomUUID(),
    seedId: params.seedId,
    previousStatus: params.previousStatus,
    nextStatus: params.nextStatus,
    action: params.action,
    reviewerId: params.reviewerId,
    timestamp: new Date().toISOString(),
    reason: params.reason?.trim() || null,
    canonicalSeedId: params.canonicalSeedId ?? null,
  };

  const op = writeChain.then(async () => {
    const all = await readAll();
    all.push(entry);
    await writeAll(all.slice(-5000));
    return entry;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function listQaAuditEntries(opts: {
  seedId?: string;
  limit?: number;
} = {}): Promise<QaAuditEntry[]> {
  const all = await readAll();
  let filtered = opts.seedId ? all.filter((e) => e.seedId === opts.seedId) : all;
  filtered = filtered.slice().reverse();
  const limit = opts.limit ?? 100;
  return filtered.slice(0, limit);
}

export async function resetQaAuditForTests(): Promise<void> {
  const op = writeChain.then(() => writeAll([]));
  writeChain = op.catch(() => undefined);
  await op;
}
