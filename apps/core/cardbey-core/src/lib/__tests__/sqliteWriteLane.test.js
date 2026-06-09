import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isSqliteAuthorityWriteInFlight,
  resetSqliteWriteLaneForTests,
  runSqliteAuthorityWrite,
} from '../sqliteWriteLane.js';

describe('sqliteWriteLane', () => {
  const prevSerialization = process.env.PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION;

  beforeEach(() => {
    resetSqliteWriteLaneForTests();
    process.env.PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION = 'true';
  });

  afterEach(() => {
    resetSqliteWriteLaneForTests();
    if (prevSerialization === undefined) {
      delete process.env.PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION;
    } else {
      process.env.PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION = prevSerialization;
    }
  });

  it('nested authority writes run inline (no FIFO deadlock)', async () => {
    const order = [];
    const outer = runSqliteAuthorityWrite(async () => {
      order.push('outer-start');
      await runSqliteAuthorityWrite(async () => {
        order.push('inner');
        return 'inner-ok';
      }, 'inner');
      order.push('outer-end');
      return 'outer-ok';
    }, 'outer');

    await expect(outer).resolves.toBe('outer-ok');
    expect(order).toEqual(['outer-start', 'inner', 'outer-end']);
    expect(isSqliteAuthorityWriteInFlight()).toBe(false);
  });

  it('rejects release the lane for the next queued write', async () => {
    const first = runSqliteAuthorityWrite(async () => {
      throw new Error('lane_fail');
    }, 'first');
    await expect(first).rejects.toThrow('lane_fail');

    const second = runSqliteAuthorityWrite(async () => 'second-ok', 'second');
    await expect(second).resolves.toBe('second-ok');
    expect(isSqliteAuthorityWriteInFlight()).toBe(false);
  });
});
