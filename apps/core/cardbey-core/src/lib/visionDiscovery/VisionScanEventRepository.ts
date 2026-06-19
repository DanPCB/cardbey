/**
 * JSON-backed VisionScanEvent store.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  VisionScanEvent,
  VisionScanEventStatus,
  VisionScanListFilters,
  VisionScanType,
} from './visionScanTypes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir(): string {
  return (
    process.env.VISION_DISCOVERY_DIR ||
    path.join(CORE_ROOT, 'data', 'visionDiscovery')
  );
}

function eventsFile(): string {
  return path.join(storeDir(), 'scanEvents.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as { code: string }).code
        : '';
    if (code === 'ENOENT') return fallback;
    console.warn('[VisionScanEventRepository] read failed:', err);
    return fallback;
  }
}

async function writeJsonFile(file: string, data: unknown): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export async function listVisionScanEvents(
  filters: VisionScanListFilters = {},
): Promise<VisionScanEvent[]> {
  const all = await readJsonFile<VisionScanEvent[]>(eventsFile(), []);
  let rows = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  if (filters.scanType) rows = rows.filter((r) => r.scanType === filters.scanType);
  if (filters.since) {
    const since = filters.since;
    rows = rows.filter((r) => r.createdAt >= since);
  }
  const limit = filters.limit ?? 100;
  return rows.slice(0, limit);
}

export async function getVisionScanEventById(id: string): Promise<VisionScanEvent | null> {
  const all = await readJsonFile<VisionScanEvent[]>(eventsFile(), []);
  return all.find((r) => r.id === id) ?? null;
}

export async function findVisionScanByFingerprint(fp: {
  domain?: string | null;
  resolvedUrl?: string | null;
  rawPayload?: string | null;
  entityName?: string | null;
}): Promise<VisionScanEvent | null> {
  const all = await readJsonFile<VisionScanEvent[]>(eventsFile(), []);
  const domain = fp.domain?.toLowerCase() ?? null;
  const url = fp.resolvedUrl?.toLowerCase() ?? null;
  const raw = fp.rawPayload?.trim() ?? null;
  const name = fp.entityName?.toLowerCase() ?? null;

  for (const row of all) {
    if (raw && row.rawPayload === raw) return row;
    if (url && row.resolvedUrl?.toLowerCase() === url) return row;
    if (domain && row.domain?.toLowerCase() === domain && row.entityName?.toLowerCase() === name) {
      return row;
    }
  }
  return null;
}

export async function appendVisionScanEvent(
  partial: Omit<VisionScanEvent, 'id' | 'createdAt'> & { id?: string },
): Promise<VisionScanEvent> {
  const event: VisionScanEvent = {
    ...partial,
    id: partial.id?.trim() || randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const op = writeChain.then(async () => {
    const existing = await readJsonFile<VisionScanEvent[]>(eventsFile(), []);
    const merged = [event, ...existing.filter((r) => r.id !== event.id)];
    await writeJsonFile(eventsFile(), merged);
    return event;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function patchVisionScanEvent(
  id: string,
  patch: Partial<VisionScanEvent>,
): Promise<VisionScanEvent | null> {
  const op = writeChain.then(async () => {
    const existing = await readJsonFile<VisionScanEvent[]>(eventsFile(), []);
    const idx = existing.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const updated = { ...existing[idx], ...patch, id: existing[idx].id };
    existing[idx] = updated;
    await writeJsonFile(eventsFile(), existing);
    return updated;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function countVisionScansSince(sinceIso: string): Promise<number> {
  const all = await readJsonFile<VisionScanEvent[]>(eventsFile(), []);
  return all.filter((r) => r.createdAt >= sinceIso).length;
}

export async function countVisionScansByStatus(
  status: VisionScanEventStatus,
): Promise<number> {
  const all = await readJsonFile<VisionScanEvent[]>(eventsFile(), []);
  return all.filter((r) => r.status === status).length;
}

export function normalizeScanType(value: unknown): VisionScanType {
  const allowed: VisionScanType[] = [
    'qr',
    'camera_photo',
    'storefront_photo',
    'business_card',
    'menu_photo',
    'product_packaging',
    'poster_flyer',
    'website_screenshot',
    'uploaded_image',
    'social_profile',
    'receipt_invoice',
    'unknown',
  ];
  const s = typeof value === 'string' ? value.trim() : '';
  return allowed.includes(s as VisionScanType) ? (s as VisionScanType) : 'unknown';
}
