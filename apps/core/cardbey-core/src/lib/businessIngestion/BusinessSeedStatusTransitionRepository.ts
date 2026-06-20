/**
 * BusinessSeedStatusTransition repository — governed lifecycle audit trail.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../prisma.js';
import {
  resolveSeedTransitionBackend,
  resetSeedTransitionBackendCacheForTests,
} from './businessSeedStatusTransitionBackend.js';
import type {
  GovernedSeedLifecycleStage,
  SeedLifecycleAction,
  SeedLifecycleTransitionRecord,
  SeedVerificationStatus,
} from './types.js';

export { resetSeedTransitionBackendCacheForTests };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir(): string {
  return process.env.BUSINESS_INGESTION_DIR || path.join(CORE_ROOT, 'data', 'businessIngestion');
}

function transitionsFile(): string {
  return path.join(storeDir(), 'seed-lifecycle-transitions.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readTransitionsFile(): Promise<SeedLifecycleTransitionRecord[]> {
  try {
    const buf = await fs.readFile(transitionsFile(), 'utf8');
    const parsed = JSON.parse(buf);
    return Array.isArray(parsed) ? (parsed as SeedLifecycleTransitionRecord[]) : [];
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return [];
    return [];
  }
}

async function writeTransitionsFile(records: SeedLifecycleTransitionRecord[]): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.seed-lifecycle-transitions.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(records.slice(-10000), null, 2), 'utf8');
  await fs.rename(tmp, transitionsFile());
}

function rowToRecord(row: {
  id: string;
  seedId: string;
  fromStatus: string;
  toStatus: string;
  lifecycleStage: string;
  action: string;
  actorId: string;
  actorType: string;
  reason: string | null;
  claimRequestId: string | null;
  metadataJson: string;
  createdAt: Date;
}): SeedLifecycleTransitionRecord {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadataJson || '{}') as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    seedId: row.seedId,
    fromStatus: row.fromStatus as SeedVerificationStatus,
    toStatus: row.toStatus as SeedVerificationStatus,
    lifecycleStage: row.lifecycleStage as GovernedSeedLifecycleStage,
    action: row.action as SeedLifecycleAction,
    actorId: row.actorId,
    actorType: row.actorType as SeedLifecycleTransitionRecord['actorType'],
    reason: row.reason,
    claimRequestId: row.claimRequestId,
    metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function recordSeedLifecycleTransition(params: {
  seedId: string;
  fromStatus: SeedVerificationStatus;
  toStatus: SeedVerificationStatus;
  lifecycleStage: GovernedSeedLifecycleStage;
  action: SeedLifecycleAction;
  actorId: string;
  actorType?: SeedLifecycleTransitionRecord['actorType'];
  reason?: string | null;
  claimRequestId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<SeedLifecycleTransitionRecord> {
  const record: SeedLifecycleTransitionRecord = {
    id: randomUUID(),
    seedId: params.seedId,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    lifecycleStage: params.lifecycleStage,
    action: params.action,
    actorId: params.actorId,
    actorType: params.actorType ?? 'system',
    reason: params.reason?.trim() || null,
    claimRequestId: params.claimRequestId ?? null,
    metadata: params.metadata ?? {},
    createdAt: new Date().toISOString(),
  };

  const backend = await resolveSeedTransitionBackend();
  if (backend === 'db') {
    await prisma.businessSeedStatusTransition.create({
      data: {
        id: record.id,
        seedId: record.seedId,
        fromStatus: record.fromStatus,
        toStatus: record.toStatus,
        lifecycleStage: record.lifecycleStage,
        action: record.action,
        actorId: record.actorId,
        actorType: record.actorType,
        reason: record.reason,
        claimRequestId: record.claimRequestId,
        metadataJson: JSON.stringify(record.metadata),
        createdAt: new Date(record.createdAt),
      },
    });
    return record;
  }

  const op = writeChain.then(async () => {
    const all = await readTransitionsFile();
    all.push(record);
    await writeTransitionsFile(all);
    return record;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function listSeedLifecycleTransitions(opts: {
  seedId?: string;
  limit?: number;
} = {}): Promise<SeedLifecycleTransitionRecord[]> {
  const limit = opts.limit ?? 100;
  const backend = await resolveSeedTransitionBackend();

  if (backend === 'db') {
    const rows = await prisma.businessSeedStatusTransition.findMany({
      where: opts.seedId ? { seedId: opts.seedId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(rowToRecord);
  }

  let all = await readTransitionsFile();
  if (opts.seedId) all = all.filter((r) => r.seedId === opts.seedId);
  return all.slice(-limit).reverse();
}

export async function resetSeedLifecycleTransitionsForTests(): Promise<void> {
  resetSeedTransitionBackendCacheForTests();
  const backend = await resolveSeedTransitionBackend();
  if (backend === 'db') {
    await prisma.businessSeedStatusTransition.deleteMany({});
    return;
  }
  const op = writeChain.then(() => writeTransitionsFile([]));
  writeChain = op.catch(() => undefined);
  await op;
}
