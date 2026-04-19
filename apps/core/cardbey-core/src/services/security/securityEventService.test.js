import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, stores } = vi.hoisted(() => {
  const securityEvents = [];

  return {
    stores: { securityEvents },
    prismaMock: {
      securityEvent: {
        async create({ data }) {
          const now = new Date();
          const record = {
            id: `security-${securityEvents.length + 1}`,
            isRead: false,
            ...data,
            createdAt: now,
            updatedAt: now,
          };
          securityEvents.unshift(record);
          return record;
        },
        async findFirst({ where }) {
          return (
            securityEvents.find(
              (item) =>
                item.type === where.type &&
                item.severity === where.severity &&
                item.source === where.source &&
                item.route === where.route &&
                item.actorUserId === where.actorUserId &&
                item.actorEmail === where.actorEmail
            ) ?? null
          );
        },
        async update({ where, data }) {
          const record = securityEvents.find((item) => item.id === where.id);
          Object.assign(record, data);
          return record;
        },
        async findMany() {
          return securityEvents;
        },
      },
    },
  };
});

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: () => prismaMock,
}));

import {
  recordSecurityEvent,
  sanitizeSecurityEventDetails,
  SecurityEventSeverity,
  SecurityEventType,
} from './securityEventService.js';

describe('securityEventService', () => {
  beforeEach(() => {
    stores.securityEvents.length = 0;
  });

  it('dedupes repeated noisy events inside the rolling window', async () => {
    const actor = { id: 'user-1', email: 'admin@cardbey.local' };

    const first = await recordSecurityEvent({
      actor,
      type: SecurityEventType.ADMIN_GUARD_FORBIDDEN_PATH,
      severity: SecurityEventSeverity.HIGH,
      source: 'guard_layer',
      route: '/api/dev/system-missions/code-task',
      details: {
        code: 'forbidden_allowed_path',
        path: 'apps/core/cardbey-core/src/kernel',
      },
    });

    const second = await recordSecurityEvent({
      actor,
      type: SecurityEventType.ADMIN_GUARD_FORBIDDEN_PATH,
      severity: SecurityEventSeverity.HIGH,
      source: 'guard_layer',
      route: '/api/dev/system-missions/code-task',
      details: {
        code: 'forbidden_allowed_path',
        path: 'apps/core/cardbey-core/src/kernel',
      },
    });

    expect(stores.securityEvents.length).toBe(1);
    expect(second.id).toBe(first.id);
  });

  it('does not dedupe successful proposal creation events', async () => {
    const actor = { id: 'user-1', email: 'admin@cardbey.local' };

    await recordSecurityEvent({
      actor,
      type: SecurityEventType.ADMIN_GUARD_PROPOSAL_CREATED,
      severity: SecurityEventSeverity.INFO,
      source: 'system_mission',
      route: '/api/dev/system-missions/code-task/proposals',
      details: { proposalId: 'proposal-1' },
    });

    await recordSecurityEvent({
      actor,
      type: SecurityEventType.ADMIN_GUARD_PROPOSAL_CREATED,
      severity: SecurityEventSeverity.INFO,
      source: 'system_mission',
      route: '/api/dev/system-missions/code-task/proposals',
      details: { proposalId: 'proposal-2' },
    });

    expect(stores.securityEvents.length).toBe(2);
  });

  it('sanitizes risky details but keeps safe metadata', () => {
    const sanitized = sanitizeSecurityEventDetails({
      code: 'invalid_payload',
      authorization: 'Bearer secret',
      cookies: { token: 'abc' },
      path: '/api/dev/security-events',
      nested: {
        safeReason: 'missing_allowed_paths',
        requestBody: { raw: 'drop me' },
      },
    });

    expect(sanitized.code).toBe('invalid_payload');
    expect(sanitized.path).toBe('/api/dev/security-events');
    expect(sanitized.authorization).toBeUndefined();
    expect(sanitized.cookies).toBeUndefined();
    expect(sanitized.nested.safeReason).toBe('missing_allowed_paths');
    expect(sanitized.nested.requestBody).toBeUndefined();
  });
});
