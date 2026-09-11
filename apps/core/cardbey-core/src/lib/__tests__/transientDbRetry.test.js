/**
 * Transient database retry helper regression tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyTransientDbError,
  isTransientDbError,
  withTransientDbRetry,
  DatabaseTemporarilyUnavailableError,
} from '../transientDbRetry.js';

describe('classifyTransientDbError', () => {
  it('classifies "database system is in recovery mode" as transient', () => {
    const err = new Error('FATAL: the database system is in recovery mode');
    expect(classifyTransientDbError(err)).toBe('postgres_recovery');
    expect(isTransientDbError(err)).toBe(true);
  });

  it('classifies "cannot connect now" as transient', () => {
    const err = new Error('FATAL: cannot connect now');
    expect(classifyTransientDbError(err)).toBe('postgres_cannot_connect');
  });

  it('classifies "server closed the connection unexpectedly" as transient', () => {
    const err = new Error('server closed the connection unexpectedly');
    expect(classifyTransientDbError(err)).toBe('connection_closed');
  });

  it('classifies "connection terminated unexpectedly" as transient', () => {
    const err = new Error('connection terminated unexpectedly');
    expect(classifyTransientDbError(err)).toBe('connection_terminated');
  });

  it('classifies Prisma P1001 as transient', () => {
    const err = { code: 'P1001', message: 'Can\'t reach database server' };
    expect(classifyTransientDbError(err)).toBe('db_unreachable');
  });

  it('classifies Prisma P1017 as transient', () => {
    const err = { code: 'P1017', message: 'Server has closed the connection.' };
    expect(classifyTransientDbError(err)).toBe('connection_closed');
  });

  it('classifies PrismaClientInitializationError as transient', () => {
    const err = new Error('Initialization error');
    err.name = 'PrismaClientInitializationError';
    expect(classifyTransientDbError(err)).toBe('prisma_initialization');
  });

  it('does NOT classify unique constraint violations as transient', () => {
    const err = { code: 'P2002', message: 'Unique constraint failed' };
    expect(isTransientDbError(err)).toBe(false);
  });

  it('does NOT classify foreign key violations as transient', () => {
    const err = { code: 'P2003', message: 'Foreign key constraint failed' };
    expect(isTransientDbError(err)).toBe(false);
  });

  it('does NOT classify record not found as transient', () => {
    const err = { code: 'P2025', message: 'Record to update not found.' };
    expect(isTransientDbError(err)).toBe(false);
  });

  it('does NOT classify validation errors as transient', () => {
    const err = new Error('Validation failed');
    err.name = 'ValidationError';
    expect(isTransientDbError(err)).toBe(false);
  });
});

describe('withTransientDbRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('TEST A: retries transient failures and eventually succeeds', async () => {
    const fn = vi.fn();
    fn.mockRejectedValueOnce(new Error('database system is in recovery mode'));
    fn.mockRejectedValueOnce(new Error('database system is in recovery mode'));
    fn.mockResolvedValueOnce({ id: 'mission-1' });

    const result = await withTransientDbRetry(fn, {
      operation: 'mission.findUnique',
      delaysMs: [10, 10, 10],
      maxRetries: 3,
    });

    expect(result).toEqual({ id: 'mission-1' });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('TEST B: exhausted retry budget throws DatabaseTemporarilyUnavailableError', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('database system is in recovery mode'));

    await expect(
      withTransientDbRetry(fn, {
        operation: 'mission.findUnique',
        delaysMs: [10, 10, 10],
        maxRetries: 2,
      }),
    ).rejects.toBeInstanceOf(DatabaseTemporarilyUnavailableError);

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('TEST C: non-transient errors fail immediately without retry', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Unique constraint failed on the fields: (`email`)'));

    await expect(
      withTransientDbRetry(fn, {
        operation: 'user.create',
        delaysMs: [10, 10, 10],
        maxRetries: 3,
      }),
    ).rejects.toThrow('Unique constraint failed');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('TEST D: succeeds on first invocation with no delay/retry behaviour', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 'mission-ok' });

    const result = await withTransientDbRetry(fn, {
      operation: 'mission.findUnique',
      delaysMs: [10, 10],
      maxRetries: 2,
    });

    expect(result).toEqual({ id: 'mission-ok' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exposed error is user-safe and hides raw Prisma internals', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid prisma.mission.findUnique() invocation\nFATAL: the database system is in recovery mode'));

    try {
      await withTransientDbRetry(fn, {
        operation: 'mission.findUnique',
        delaysMs: [10],
        maxRetries: 1,
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DatabaseTemporarilyUnavailableError);
      expect(err.code).toBe('DATABASE_TEMPORARILY_UNAVAILABLE');
      expect(err.status).toBe(503);
      expect(err.retryable).toBe(true);
      expect(err.message).not.toContain('prisma.mission.findUnique');
      expect(err.message).not.toContain('FATAL');
      expect(err.message).toContain('temporarily reconnecting');
    }
  });
});
