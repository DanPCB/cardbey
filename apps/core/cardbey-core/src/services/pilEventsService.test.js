import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    pilEvent: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

vi.mock('../lib/metrics/foundationMetrics.js', () => ({
  record: vi.fn(),
}));

import { prisma } from '../lib/prisma.js';
import {
  isPilEventTableMissingError,
  recordPilEvent,
  resetPilEventTableMissingLogForTests,
} from './pilEventsService.js';

describe('pilEventsService', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    resetPilEventTableMissingLogForTests();
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'file:./prisma/dev-fresh.db';
  });

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    process.env.DATABASE_URL = prevDbUrl;
    resetPilEventTableMissingLogForTests();
  });

  it('detects PilEvent missing table errors', () => {
    const err = Object.assign(new Error('The table `main.PilEvent` does not exist'), { code: 'P2021' });
    expect(isPilEventTableMissingError(err)).toBe(true);
  });

  it('returns safe no-op in local dev when PilEvent table is missing', async () => {
    prisma.pilEvent.create.mockRejectedValue(
      Object.assign(new Error('The table `main.PilEvent` does not exist'), { code: 'P2021' }),
    );

    const row = await recordPilEvent({ type: 'attention_signal', metadata: {} });

    expect(row.persisted).toBe(false);
    expect(row.reason).toBe('PIL_EVENT_TABLE_MISSING');
    expect(row.id).toBeNull();
  });

  it('persists when create succeeds', async () => {
    prisma.pilEvent.create.mockResolvedValue({ id: 'pil-1', type: 'attention_signal' });

    const row = await recordPilEvent({ type: 'attention_signal', metadata: {} });

    expect(row.persisted).toBe(true);
    expect(row.id).toBe('pil-1');
  });
});
