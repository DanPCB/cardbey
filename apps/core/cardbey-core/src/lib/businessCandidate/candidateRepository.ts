/**
 * Persisted BusinessCandidate storage — JSON file (local/test) with batch-scoped layout.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  BusinessCandidateRecord,
  BusinessCandidateTransitionRecord,
} from './types.js';
import {
  resolveBusinessCandidateStoreRoot,
  resetBusinessCandidateStoreRootForTests,
} from './businessCandidateStoreRoot.js';

function storeRoot(): string {
  return resolveBusinessCandidateStoreRoot();
}

function candidatesFile(): string {
  return path.join(storeRoot(), 'candidates.json');
}

function transitionsFile(): string {
  return path.join(storeRoot(), 'transitions.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return fallback;
    console.warn('[businessCandidateRepository] read failed:', err);
    return fallback;
  }
}

async function writeJsonFile(file: string, data: unknown): Promise<void> {
  const dir = storeRoot();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

async function queuedWrite(file: string, data: unknown): Promise<void> {
  const op = writeChain.then(() => writeJsonFile(file, data));
  writeChain = op.catch(() => undefined);
  await op;
}

export async function listBusinessCandidates(): Promise<BusinessCandidateRecord[]> {
  return readJsonFile<BusinessCandidateRecord[]>(candidatesFile(), []);
}

export async function listBusinessCandidatesByBatch(batchId: string): Promise<BusinessCandidateRecord[]> {
  const all = await listBusinessCandidates();
  return all.filter((c) => c.batchId === batchId);
}

export async function getBusinessCandidateById(id: string): Promise<BusinessCandidateRecord | null> {
  const all = await listBusinessCandidates();
  return all.find((c) => c.id === id) ?? null;
}

export async function getBusinessCandidateByDedupeKey(dedupeKey: string): Promise<BusinessCandidateRecord | null> {
  const all = await listBusinessCandidates();
  return all.find((c) => c.dedupeKey === dedupeKey) ?? null;
}

export async function getBusinessCandidateBySeedId(seedId: string): Promise<BusinessCandidateRecord | null> {
  const all = await listBusinessCandidates();
  return all.find((c) => c.seedId === seedId) ?? null;
}

export async function getBusinessCandidateByStoreId(
  storeId: string,
): Promise<BusinessCandidateRecord | null> {
  const id = String(storeId ?? '').trim();
  if (!id) return null;
  const all = await listBusinessCandidates();
  return all.find((c) => c.storeId === id) ?? null;
}

export async function upsertBusinessCandidates(
  incoming: BusinessCandidateRecord[],
): Promise<BusinessCandidateRecord[]> {
  const all = await listBusinessCandidates();
  const byId = new Map(all.map((c) => [c.id, c]));
  const byDedupe = new Map(all.map((c) => [c.dedupeKey, c]));

  for (const record of incoming) {
    const existing = byId.get(record.id) ?? byDedupe.get(record.dedupeKey);
    if (existing) {
      byId.set(existing.id, { ...existing, ...record, id: existing.id, createdAt: existing.createdAt });
    } else {
      byId.set(record.id, record);
    }
  }

  const merged = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await queuedWrite(candidatesFile(), merged);
  return incoming.map((r) => byId.get(r.id) ?? r);
}

export async function saveBusinessCandidate(record: BusinessCandidateRecord): Promise<BusinessCandidateRecord> {
  const [saved] = await upsertBusinessCandidates([record]);
  return saved;
}

export async function appendCandidateTransition(
  transition: Omit<BusinessCandidateTransitionRecord, 'id' | 'createdAt'>,
): Promise<BusinessCandidateTransitionRecord> {
  const all = await readJsonFile<BusinessCandidateTransitionRecord[]>(transitionsFile(), []);
  const row: BusinessCandidateTransitionRecord = {
    ...transition,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  all.push(row);
  await queuedWrite(transitionsFile(), all);
  return row;
}

export async function listCandidateTransitions(
  candidateId: string,
  limit = 50,
): Promise<BusinessCandidateTransitionRecord[]> {
  const all = await readJsonFile<BusinessCandidateTransitionRecord[]>(transitionsFile(), []);
  return all
    .filter((t) => t.candidateId === candidateId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function resetBusinessCandidatesForTests(): Promise<void> {
  resetBusinessCandidateStoreRootForTests();
  await queuedWrite(candidatesFile(), []);
  await queuedWrite(transitionsFile(), []);
}

export function buildCandidateDedupeKey(input: {
  name: string | null;
  phone: string | null;
  address: string | null;
  suburb: string | null;
}): string {
  const norm = (v: string | null) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return [norm(input.name), norm(input.phone), norm(input.address), norm(input.suburb)].join('|');
}
