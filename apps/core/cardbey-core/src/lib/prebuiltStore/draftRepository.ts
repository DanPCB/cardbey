import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ClaimConversionRecord,
  PrebuiltStoreDraft,
  PreviewTokenRecord,
} from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeRoot(): string {
  return process.env.PREBUILT_STORE_DIR || path.join(CORE_ROOT, 'data', 'prebuiltStores');
}

function draftsFile(): string {
  return path.join(storeRoot(), 'drafts.json');
}

function previewTokensFile(): string {
  return path.join(storeRoot(), 'previewTokens.json');
}

function claimsFile(): string {
  return path.join(storeRoot(), 'claimConversions.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return fallback;
    console.warn('[prebuiltDraftRepository] read failed:', err);
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

export async function listPrebuiltDrafts(): Promise<PrebuiltStoreDraft[]> {
  return readJsonFile<PrebuiltStoreDraft[]>(draftsFile(), []);
}

export async function getPrebuiltDraftById(id: string): Promise<PrebuiltStoreDraft | null> {
  const all = await listPrebuiltDrafts();
  return all.find((draft) => draft.id === id) ?? null;
}

export async function getPrebuiltDraftByCandidateId(
  candidateId: string,
): Promise<PrebuiltStoreDraft | null> {
  const all = await listPrebuiltDrafts();
  return all.find((draft) => draft.candidateId === candidateId) ?? null;
}

export async function getPrebuiltDraftByCardId(cardId: string): Promise<PrebuiltStoreDraft | null> {
  const all = await listPrebuiltDrafts();
  return all.find((draft) => draft.cardId === cardId) ?? null;
}

export async function savePrebuiltDraft(draft: PrebuiltStoreDraft): Promise<PrebuiltStoreDraft> {
  const all = await listPrebuiltDrafts();
  const idx = all.findIndex((row) => row.id === draft.id);
  if (idx >= 0) {
    all[idx] = draft;
  } else {
    all.push(draft);
  }
  all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await queuedWrite(draftsFile(), all);
  return draft;
}

export async function listPreviewTokens(): Promise<PreviewTokenRecord[]> {
  return readJsonFile<PreviewTokenRecord[]>(previewTokensFile(), []);
}

export async function getPreviewTokenByHash(tokenHash: string): Promise<PreviewTokenRecord | null> {
  const all = await listPreviewTokens();
  return all.find((row) => row.tokenHash === tokenHash) ?? null;
}

export async function savePreviewToken(record: PreviewTokenRecord): Promise<PreviewTokenRecord> {
  const all = await listPreviewTokens();
  const idx = all.findIndex((row) => row.id === record.id);
  if (idx >= 0) {
    all[idx] = record;
  } else {
    all.push(record);
  }
  all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await queuedWrite(previewTokensFile(), all);
  return record;
}

export async function listClaimConversionRecords(): Promise<ClaimConversionRecord[]> {
  return readJsonFile<ClaimConversionRecord[]>(claimsFile(), []);
}

export async function getClaimConversionById(id: string): Promise<ClaimConversionRecord | null> {
  const all = await listClaimConversionRecords();
  return all.find((row) => row.id === id) ?? null;
}

export async function getClaimConversionByHash(
  claimTokenHash: string,
): Promise<ClaimConversionRecord | null> {
  const all = await listClaimConversionRecords();
  return all.find((row) => row.claimTokenHash === claimTokenHash) ?? null;
}

export async function saveClaimConversionRecord(
  record: ClaimConversionRecord,
): Promise<ClaimConversionRecord> {
  const all = await listClaimConversionRecords();
  const idx = all.findIndex((row) => row.id === record.id);
  if (idx >= 0) {
    all[idx] = record;
  } else {
    all.push(record);
  }
  all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await queuedWrite(claimsFile(), all);
  return record;
}

export async function resetPrebuiltStoreDataForTests(): Promise<void> {
  await queuedWrite(draftsFile(), []);
  await queuedWrite(previewTokensFile(), []);
  await queuedWrite(claimsFile(), []);
}
