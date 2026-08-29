/**
 * ClaimIntent persistence (JSON).
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ClaimIntentRecord } from './types.js';
import { resolveBusinessCandidateStoreRoot } from '../businessCandidateStoreRoot.js';

function intentsFile(): string {
  return path.join(resolveBusinessCandidateStoreRoot(), 'claim-intents.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<ClaimIntentRecord[]> {
  try {
    const buf = await fs.readFile(intentsFile(), 'utf8');
    return JSON.parse(buf) as ClaimIntentRecord[];
  } catch {
    return [];
  }
}

async function writeAll(rows: ClaimIntentRecord[]): Promise<void> {
  const file = intentsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export async function listClaimIntents(): Promise<ClaimIntentRecord[]> {
  return readAll();
}

export async function getClaimIntentById(id: string): Promise<ClaimIntentRecord | null> {
  const all = await readAll();
  return all.find((row) => row.id === id) ?? null;
}

export async function findClaimIntent(params: {
  candidateId?: string | null;
  seedId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
}): Promise<ClaimIntentRecord | null> {
  const all = await readAll();
  return (
    all.find((r) => {
      if (params.candidateId && r.candidateId === params.candidateId) return true;
      if (params.seedId && r.seedId === params.seedId) {
        if (params.userId && r.userId === params.userId) return true;
        if (params.sessionId && r.sessionId === params.sessionId) return true;
        if (!params.userId && !params.sessionId) return true;
      }
      return false;
    }) ?? null
  );
}

export async function saveClaimIntent(intent: ClaimIntentRecord): Promise<ClaimIntentRecord> {
  const all = await readAll();
  const idx = all.findIndex((r) => r.id === intent.id);
  if (idx >= 0) all[idx] = intent;
  else all.push(intent);
  const op = writeChain.then(() => writeAll(all));
  writeChain = op.catch(() => undefined);
  await op;
  return intent;
}

export function newClaimIntentId(): string {
  return randomUUID();
}

export async function resetClaimIntentsForTests(): Promise<void> {
  const op = writeChain.then(() => writeAll([]));
  writeChain = op.catch(() => undefined);
  await op;
}
