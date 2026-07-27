/**
 * Phase 3 — DecisionRecord store (in-memory + optional JSONL).
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DecisionRecord } from './decisionRecord.types.js';

const recordsById = new Map<string, DecisionRecord>();
const allRecords: DecisionRecord[] = [];

export type DecisionRecordFilters = {
  streamId?: string;
  agreement?: DecisionRecord['calibration']['agreement'];
  sinceMs?: number;
  limit?: number;
};

function appendJsonl(record: DecisionRecord): void {
  const logPath = String(process.env.KERNEL_DECISION_RECORD_LOG_PATH ?? '').trim();
  if (!logPath) return;
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (err) {
    console.warn(
      '[KernelCognitive] decision record log append failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }
}

export function saveDecisionRecord(record: DecisionRecord): DecisionRecord {
  const frozen = deepFreeze(structuredClone(record)) as DecisionRecord;
  recordsById.set(frozen.decisionRecordId, frozen);
  allRecords.push(frozen);
  appendJsonl(frozen);
  return frozen;
}

function deepFreeze<T>(value: T): T {
  if (value == null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

export function getDecisionRecord(decisionRecordId: string): DecisionRecord | undefined {
  return recordsById.get(decisionRecordId);
}

export function listDecisionRecords(filters: DecisionRecordFilters = {}): DecisionRecord[] {
  let list = [...allRecords];

  if (filters.streamId) {
    list = list.filter((r) => r.streamId === filters.streamId);
  }
  if (filters.agreement) {
    list = list.filter((r) => r.calibration.agreement === filters.agreement);
  }
  if (filters.sinceMs != null) {
    list = list.filter((r) => Date.parse(r.createdAt) >= filters.sinceMs!);
  }
  if (filters.limit != null && filters.limit > 0) {
    list = list.slice(-filters.limit);
  }

  return list;
}

/** Phase 3 test helper. */
export function __clearCalibrationStoreForTests(): void {
  recordsById.clear();
  allRecords.length = 0;
}
