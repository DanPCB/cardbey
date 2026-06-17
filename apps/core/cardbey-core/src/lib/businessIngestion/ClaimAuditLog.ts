/**
 * Claim lifecycle audit log (V1.2).
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClaimAuditEntry, ClaimLifecycleAction } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir(): string {
  return (
    process.env.BUSINESS_INGESTION_DIR ||
    path.join(CORE_ROOT, 'data', 'businessIngestion')
  );
}

function auditFile(): string {
  return path.join(storeDir(), 'claim-audit.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<ClaimAuditEntry[]> {
  try {
    const buf = await fs.readFile(auditFile(), 'utf8');
    const parsed = JSON.parse(buf);
    return Array.isArray(parsed) ? (parsed as ClaimAuditEntry[]) : [];
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return [];
    return [];
  }
}

async function writeAll(entries: ClaimAuditEntry[]): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.claim-audit.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(entries, null, 2), 'utf8');
  await fs.rename(tmp, auditFile());
}

export async function appendClaimAuditEntry(params: {
  seedId: string;
  claimRequestId?: string | null;
  action: ClaimLifecycleAction;
  actorId: string;
  previousStatus?: string | null;
  nextStatus?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  /** @deprecated use metadata */
  details?: Record<string, unknown> | null;
}): Promise<ClaimAuditEntry> {
  const entry: ClaimAuditEntry = {
    id: randomUUID(),
    seedId: params.seedId,
    claimRequestId: params.claimRequestId ?? null,
    action: params.action,
    actorId: params.actorId,
    previousStatus: params.previousStatus ?? null,
    nextStatus: params.nextStatus ?? null,
    reason: params.reason ?? null,
    timestamp: new Date().toISOString(),
    metadata: params.metadata ?? params.details ?? null,
    details: params.metadata ?? params.details ?? null,
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

export async function listClaimAuditEntries(opts: {
  seedId?: string;
  limit?: number;
} = {}): Promise<ClaimAuditEntry[]> {
  const all = await readAll();
  let filtered = opts.seedId ? all.filter((e) => e.seedId === opts.seedId) : all;
  filtered = filtered.slice().reverse();
  return filtered.slice(0, opts.limit ?? 100);
}

export async function resetClaimAuditForTests(): Promise<void> {
  const op = writeChain.then(() => writeAll([]));
  writeChain = op.catch(() => undefined);
  await op;
}
