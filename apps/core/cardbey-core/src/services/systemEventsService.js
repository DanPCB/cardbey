/**
 * System Events Service
 * Records and queries system events from devices, orchestrator, and dashboard
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Record a system event
 * 
 * @param {Object} input - Event input
 * @param {string} input.source - 'device' | 'orchestrator' | 'dashboard'
 * @param {string} input.type - Event type
 * @param {string} [input.severity] - 'info' | 'low' | 'medium' | 'high' | 'critical'
 * @param {string} [input.deviceId] - Device ID
 * @param {string} [input.tenantId] - Tenant ID
 * @param {any} [input.payload] - Event payload
 */
export async function recordSystemEvent(input) {
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
 * 
 * @param {Object} [params] - Query parameters
 * @param {Date} [params.from] - Start date
 * @param {Date} [params.to] - End date
 * @param {number} [params.limit=100] - Max number of events
 * @param {string} [params.source] - Filter by source
 * @param {string} [params.type] - Filter by type
 * @returns {Promise<Array>} Array of events
 */
export async function getRecentEvents(params = {}) {
  const {
    from,
    to,
    limit = 100,
    source,
    type,
  } = params;

  const where = {};

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
 * 
 * @param {Array} events - Array of events
 * @returns {Object} Aggregated statistics
 */
export function computeAggregates(events) {
  const aggregates = {
    total: events.length,
    bySource: {},
    byType: {},
    bySeverity: {},
    errors: [],
    recentErrors: [],
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

