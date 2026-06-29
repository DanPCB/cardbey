/**
 * Candidate media evidence persistence (JSON).
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CandidateMediaAsset } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function mediaFile(): string {
  const root =
    process.env.BUSINESS_CANDIDATE_DIR ||
    path.join(CORE_ROOT, 'data', 'businessCandidates');
  return path.join(root, 'media-evidence.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<CandidateMediaAsset[]> {
  try {
    const buf = await fs.readFile(mediaFile(), 'utf8');
    return JSON.parse(buf) as CandidateMediaAsset[];
  } catch {
    return [];
  }
}

async function writeAll(rows: CandidateMediaAsset[]): Promise<void> {
  const file = mediaFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export async function listMediaForCandidate(candidateId: string): Promise<CandidateMediaAsset[]> {
  return (await readAll()).filter((a) => a.candidateId === candidateId);
}

export async function listMediaForSeed(seedId: string): Promise<CandidateMediaAsset[]> {
  return (await readAll()).filter((a) => a.seedId === seedId);
}

export async function upsertMediaAssets(assets: CandidateMediaAsset[]): Promise<CandidateMediaAsset[]> {
  const all = await readAll();
  const byId = new Map(all.map((a) => [a.id, a]));
  for (const asset of assets) {
    byId.set(asset.id, asset);
  }
  const merged = [...byId.values()];
  const op = writeChain.then(() => writeAll(merged));
  writeChain = op.catch(() => undefined);
  await op;
  return assets;
}

export async function updateMediaUsageStatus(
  assetId: string,
  usageStatus: CandidateMediaAsset['usageStatus'],
): Promise<CandidateMediaAsset | null> {
  const all = await readAll();
  const idx = all.findIndex((a) => a.id === assetId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx]!, usageStatus };
  await writeAll(all);
  return all[idx]!;
}

export function newMediaAssetId(): string {
  return randomUUID();
}

export async function resetMediaEvidenceForTests(): Promise<void> {
  const op = writeChain.then(() => writeAll([]));
  writeChain = op.catch(() => undefined);
  await op;
}
