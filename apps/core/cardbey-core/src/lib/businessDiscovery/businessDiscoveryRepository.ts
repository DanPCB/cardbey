/**
 * Persistence for discovered/unclaimed business candidates.
 *
 * DESIGN NOTE (safety): we deliberately do NOT write unclaimed/external data into
 * the Prisma `Business` table — that model implies an owning `userId` and is the
 * source of truth for owner-confirmed records. Discovery records live in a separate
 * JSON store so external, unverified data is never confused with official records and
 * no schema migration is required for Phase 1.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BusinessDiscoveryCandidate } from './businessDiscoveryTypes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/lib/businessDiscovery → core root is three levels up.
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir(): string {
  return (
    process.env.BUSINESS_DISCOVERY_DIR ||
    path.join(CORE_ROOT, 'data', 'businessDiscovery')
  );
}

function storeFile(): string {
  return path.join(storeDir(), 'candidates.json');
}

// Serialize writes to avoid lost updates under concurrency.
let writeChain: Promise<unknown> = Promise.resolve();

async function readAllRaw(): Promise<BusinessDiscoveryCandidate[]> {
  try {
    const buf = await fs.readFile(storeFile(), 'utf8');
    const parsed = JSON.parse(buf);
    return Array.isArray(parsed) ? (parsed as BusinessDiscoveryCandidate[]) : [];
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return [];
    console.warn('[businessDiscoveryRepository] read failed:', err?.message || err);
    return [];
  }
}

async function writeAll(records: BusinessDiscoveryCandidate[]): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.candidates.${process.pid}.${Date.now()}.tmp`);
  const file = storeFile();
  await fs.writeFile(tmp, JSON.stringify(records, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export async function listCandidates(): Promise<BusinessDiscoveryCandidate[]> {
  return readAllRaw();
}

export async function getCandidateById(
  id: string,
): Promise<BusinessDiscoveryCandidate | null> {
  if (!id) return null;
  const all = await readAllRaw();
  return all.find((c) => c.id === id) ?? null;
}

/**
 * Insert or update a candidate (matched by id). Returns the persisted record.
 * All writes are serialized through a single chain.
 */
export async function saveCandidate(
  candidate: BusinessDiscoveryCandidate,
): Promise<BusinessDiscoveryCandidate> {
  const op = writeChain.then(async () => {
    const all = await readAllRaw();
    const idx = all.findIndex((c) => c.id === candidate.id);
    if (idx >= 0) all[idx] = candidate;
    else all.push(candidate);
    await writeAll(all);
    return candidate;
  });
  // Keep the chain alive even if this op rejects.
  writeChain = op.catch(() => undefined);
  return op;
}

/** Test helper: wipe the store. */
export async function resetCandidatesForTests(): Promise<void> {
  const op = writeChain.then(() => writeAll([]));
  writeChain = op.catch(() => undefined);
  await op;
}
