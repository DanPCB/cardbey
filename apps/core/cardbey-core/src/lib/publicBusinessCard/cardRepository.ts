import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CorrectionReport, PublicBusinessCardRecord } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeRoot(): string {
  return process.env.PUBLIC_BUSINESS_CARD_DIR || path.join(CORE_ROOT, 'data', 'publicBusinessCards');
}

function cardsFile(): string {
  return path.join(storeRoot(), 'cards.json');
}

function correctionsFile(): string {
  return path.join(storeRoot(), 'corrections.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return fallback;
    console.warn('[publicBusinessCardRepository] read failed:', err);
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

export async function listPublicBusinessCards(): Promise<PublicBusinessCardRecord[]> {
  return readJsonFile<PublicBusinessCardRecord[]>(cardsFile(), []);
}

export async function getPublicBusinessCardById(id: string): Promise<PublicBusinessCardRecord | null> {
  const all = await listPublicBusinessCards();
  return all.find((card) => card.id === id) ?? null;
}

export async function getPublicBusinessCardBySlug(
  slug: string,
): Promise<PublicBusinessCardRecord | null> {
  const normalized = String(slug ?? '').trim().toLowerCase();
  if (!normalized) return null;
  const all = await listPublicBusinessCards();
  return all.find((card) => card.slug.toLowerCase() === normalized) ?? null;
}

export async function getPublicBusinessCardByCandidateId(
  candidateId: string,
): Promise<PublicBusinessCardRecord | null> {
  const all = await listPublicBusinessCards();
  return all.find((card) => card.candidateId === candidateId) ?? null;
}

export async function savePublicBusinessCard(
  record: PublicBusinessCardRecord,
): Promise<PublicBusinessCardRecord> {
  const all = await listPublicBusinessCards();
  const idx = all.findIndex((card) => card.id === record.id);
  if (idx >= 0) {
    all[idx] = record;
  } else {
    all.push(record);
  }
  all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await queuedWrite(cardsFile(), all);
  return record;
}

export async function createCorrectionReport(
  report: Omit<CorrectionReport, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<CorrectionReport> {
  const all = await listCorrectionReports();
  const now = new Date().toISOString();
  const row: CorrectionReport = {
    ...report,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  all.push(row);
  all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await queuedWrite(correctionsFile(), all);
  return row;
}

export async function listCorrectionReports(cardId?: string): Promise<CorrectionReport[]> {
  const all = await readJsonFile<CorrectionReport[]>(correctionsFile(), []);
  if (!cardId) return all;
  return all.filter((row) => row.cardId === cardId);
}

export async function resetPublicBusinessCardsForTests(): Promise<void> {
  await queuedWrite(cardsFile(), []);
  await queuedWrite(correctionsFile(), []);
}
