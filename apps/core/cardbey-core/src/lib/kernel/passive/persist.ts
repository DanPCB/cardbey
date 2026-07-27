/**
 * Phase 2 — in-memory persistence for passive cognitive runs.
 * Durable store deferred; sufficient for observe/compare/parity logging.
 */

import type { CognitiveParityRecord, PassiveCognitiveRun } from '../types.js';

const runsById = new Map<string, PassiveCognitiveRun>();
const runsByStreamId = new Map<string, PassiveCognitiveRun[]>();
const parityRecords: CognitiveParityRecord[] = [];

export function persistPassiveCognitiveRun(run: PassiveCognitiveRun): PassiveCognitiveRun {
  const frozen = Object.freeze(structuredClone(run));
  runsById.set(frozen.runId, frozen);

  const streamRuns = runsByStreamId.get(frozen.streamId) ?? [];
  streamRuns.push(frozen);
  runsByStreamId.set(frozen.streamId, streamRuns);

  return frozen;
}

export function getPassiveCognitiveRun(runId: string): PassiveCognitiveRun | undefined {
  return runsById.get(runId);
}

export function getPassiveCognitiveRunsForStream(streamId: string): PassiveCognitiveRun[] {
  return [...(runsByStreamId.get(streamId) ?? [])];
}

export function getLatestPassiveCognitiveRun(streamId: string): PassiveCognitiveRun | undefined {
  const list = runsByStreamId.get(streamId);
  if (!list?.length) return undefined;
  return list[list.length - 1];
}

export function persistCognitiveParityRecord(record: CognitiveParityRecord): CognitiveParityRecord {
  const frozen = Object.freeze(structuredClone(record));
  parityRecords.push(frozen);
  return frozen;
}

export function listCognitiveParityRecords(streamId?: string): CognitiveParityRecord[] {
  if (!streamId) return [...parityRecords];
  return parityRecords.filter((r) => r.streamId === streamId);
}

/** Phase 2 test helper. */
export function __clearPassiveCognitiveStoreForTests(): void {
  runsById.clear();
  runsByStreamId.clear();
  parityRecords.length = 0;
}
