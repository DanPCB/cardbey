/**
 * System Events Service
 * Records and queries system events from devices, orchestrator, and dashboard
 */

import { PrismaClient } from '@prisma/client';
import type { SystemWatcherInsightSeverity } from '../../packages/ai-types/src/systemWatcher.js';

const prisma = new PrismaClient();

export interface RecordSystemEventInput {
  source: 'device' | 'orchestrator' | 'dashboard';
  type: string;
  severity?: SystemWatcherInsightSeverity;
  deviceId?: string;
  tenantId?: string;
  payload?: any;
}

export interface GetRecentEventsParams {
  from?: Date;
  to?: Date;
  limit?: number;
  source?: string;
  type?: string;
}

/**
 * Record a system event
 */
export async function recordSystemEvent(
  input: RecordSystemEventInput
): Promise<void> {
  await prisma.systemEvent.create({
    data: {
      source: input.source,
      type: input.type,
      severity: input.severity || 'info',
      deviceId: input.deviceId || null,
      tenantId: input.tenantId || null,
      payload: input.payload || {},
    },
  });
}

/**
 * Get recent events with filters
 */
export async function getRecentEvents(
  params: GetRecentEventsParams = {}
): Promise<any[]> {
  const {
    from,
    to,
    limit = 100,
    source,
    type,
  } = params;

  const where: any = {};

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }

  if (source) {
    where.source = source;
  }

  if (type) {
    where.type = type;
  }

  const events = await prisma.systemEvent.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });

  return events;
}

/**
 * Compute aggregates from events
 */
export function computeAggregates(events: any[]): {
  total: number;
  bySource: Record<string, number>;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  errors: any[];
  recentErrors: any[];
} {
  const aggregates = {
    total: events.length,
    bySource: {} as Record<string, number>,
    byType: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>,
    errors: [] as any[],
    recentErrors: [] as any[],
  };

  for (const event of events) {
    // Count by source
    aggregates.bySource[event.source] = (aggregates.bySource[event.source] || 0) + 1;

    // Count by type
    aggregates.byType[event.type] = (aggregates.byType[event.type] || 0) + 1;

    // Count by severity
    aggregates.bySeverity[event.severity || 'info'] =
      (aggregates.bySeverity[event.severity || 'info'] || 0) + 1;

    // Collect errors
    if (
      event.severity === 'high' ||
      event.severity === 'critical' ||
      event.type.includes('error') ||
      event.type.includes('failure')
    ) {
      aggregates.errors.push(event);
    }
  }

  // Get most recent errors (last 10)
  aggregates.recentErrors = aggregates.errors
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);

  return aggregates;
}

