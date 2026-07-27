/**
 * Vision intent event persistence — learning loop for intent graph.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildAgentType, VisionIntentEvent } from '../intentGraph/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir(): string {
  return (
    process.env.VISION_DISCOVERY_DIR ||
    path.join(CORE_ROOT, 'data', 'visionDiscovery')
  );
}

function eventsFile(): string {
  return path.join(storeDir(), 'intentEvents.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch {
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

export async function appendVisionIntentEvent(
  partial: Omit<VisionIntentEvent, 'id' | 'createdAt'> & { id?: string },
): Promise<VisionIntentEvent> {
  const event: VisionIntentEvent = {
    ...partial,
    id: partial.id?.trim() || randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const op = writeChain.then(async () => {
    const existing = await readJsonFile<VisionIntentEvent[]>(eventsFile(), []);
    await writeJsonFile(eventsFile(), [event, ...existing]);
    return event;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function patchVisionIntentEvent(
  id: string,
  patch: Partial<VisionIntentEvent>,
): Promise<VisionIntentEvent | null> {
  const op = writeChain.then(async () => {
    const existing = await readJsonFile<VisionIntentEvent[]>(eventsFile(), []);
    const idx = existing.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    existing[idx] = { ...existing[idx], ...patch, id: existing[idx].id };
    await writeJsonFile(eventsFile(), existing);
    return existing[idx];
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function recordIntentSuggestionsShown(input: {
  entityContextId: string;
  scanEventId: string | null;
  userId: string | null;
  sessionId: string | null;
  suggestionsShown: string[];
}): Promise<void> {
  if (!input.suggestionsShown.length) return;
  await appendVisionIntentEvent({
    scanEventId: input.scanEventId,
    entityContextId: input.entityContextId,
    userId: input.userId,
    sessionId: input.sessionId,
    intentId: '_suggestions_shown',
    selected: false,
    agentType: 'PerformerAgent' as ChildAgentType,
    missionId: null,
    outcome: 'completed',
    feedback: null,
    suggestionsShown: input.suggestionsShown,
  });
}
