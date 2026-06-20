/**
 * Map IngestionRunMetrics ↔ BusinessIngestionRun Prisma row.
 */

import type { IngestionRunMetrics } from './types.js';

export type IngestionRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'empty';

export interface IngestionRunRecord {
  id: string;
  source: string;
  status: IngestionRunStatus;
  startedAt: string;
  completedAt: string | null;
  candidateCount: number;
  seedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  errorCount: number;
  errors: Array<{ message: string; at: string }>;
  metadata: Record<string, unknown>;
}

export function metricsToRunRecord(
  metrics: IngestionRunMetrics,
  status: IngestionRunStatus = 'completed',
): IngestionRunRecord {
  const rejectedCount = Math.max(
    0,
    metrics.recordsFetched - metrics.uniqueRecords - metrics.duplicatesRemoved,
  );
  return {
    id: metrics.runId,
    source: metrics.sourceType,
    status,
    startedAt: metrics.startedAt,
    completedAt: metrics.completedAt,
    candidateCount: metrics.recordsFetched,
    seedCount: metrics.seedsCreated + metrics.seedsUpdated,
    duplicateCount: metrics.duplicatesRemoved,
    rejectedCount,
    errorCount: 0,
    errors: [],
    metadata: {
      metrics,
      sourceReference: metrics.sourceReference,
      qualityBreakdown: metrics.qualityBreakdown,
      sourceBreakdown: metrics.sourceBreakdown,
    },
  };
}

export function runRecordToMetrics(record: IngestionRunRecord): IngestionRunMetrics {
  const embedded = record.metadata?.metrics;
  if (embedded && typeof embedded === 'object' && 'runId' in (embedded as object)) {
    return embedded as IngestionRunMetrics;
  }

  return {
    runId: record.id,
    sourceType: record.source as IngestionRunMetrics['sourceType'],
    sourceReference:
      typeof record.metadata?.sourceReference === 'string'
        ? record.metadata.sourceReference
        : record.source,
    startedAt: record.startedAt,
    completedAt: record.completedAt ?? record.startedAt,
    recordsFetched: record.candidateCount,
    recordsNormalized: record.candidateCount,
    duplicatesRemoved: record.duplicateCount,
    possibleDuplicates: 0,
    uniqueRecords: record.seedCount,
    seedsCreated: record.seedCount,
    seedsUpdated: 0,
    seedsSkippedExisting: 0,
    businessStoresPersisted: 0,
    qualityBreakdown: (record.metadata?.qualityBreakdown as IngestionRunMetrics['qualityBreakdown']) ?? {
      high_quality: 0,
      medium_quality: 0,
      low_quality: 0,
    },
    sourceBreakdown: (record.metadata?.sourceBreakdown as Record<string, number>) ?? {
      [record.source]: record.candidateCount,
    },
    claimRate: 0,
    verificationRate: 0,
  };
}

export function dbRowToRunRecord(row: {
  id: string;
  source: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  candidateCount: number;
  seedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  errorCount: number;
  errorsJson: string;
  metadataJson: string;
}): IngestionRunRecord {
  let errors: IngestionRunRecord['errors'] = [];
  let metadata: Record<string, unknown> = {};
  try {
    errors = JSON.parse(row.errorsJson || '[]') as IngestionRunRecord['errors'];
  } catch {
    errors = [];
  }
  try {
    metadata = JSON.parse(row.metadataJson || '{}') as Record<string, unknown>;
  } catch {
    metadata = {};
  }

  return {
    id: row.id,
    source: row.source,
    status: row.status as IngestionRunStatus,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    candidateCount: row.candidateCount,
    seedCount: row.seedCount,
    duplicateCount: row.duplicateCount,
    rejectedCount: row.rejectedCount,
    errorCount: row.errorCount,
    errors,
    metadata,
  };
}

export function runRecordToDbRow(record: IngestionRunRecord) {
  return {
    id: record.id,
    source: record.source,
    status: record.status,
    startedAt: new Date(record.startedAt),
    completedAt: record.completedAt ? new Date(record.completedAt) : null,
    candidateCount: record.candidateCount,
    seedCount: record.seedCount,
    duplicateCount: record.duplicateCount,
    rejectedCount: record.rejectedCount,
    errorCount: record.errorCount,
    errorsJson: JSON.stringify(record.errors ?? []),
    metadataJson: JSON.stringify(record.metadata ?? {}),
    updatedAt: new Date(),
  };
}

export function summarizeRunRecord(record: IngestionRunRecord) {
  return {
    id: record.id,
    source: record.source,
    status: record.status,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    candidateCount: record.candidateCount,
    seedCount: record.seedCount,
    duplicateCount: record.duplicateCount,
    rejectedCount: record.rejectedCount,
    errorCount: record.errorCount,
    durationMs:
      record.completedAt && record.startedAt
        ? new Date(record.completedAt).getTime() - new Date(record.startedAt).getTime()
        : null,
  };
}
