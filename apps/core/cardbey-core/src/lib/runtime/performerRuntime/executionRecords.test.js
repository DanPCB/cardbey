import { describe, it, expect } from 'vitest';
import {
  normalizeExecutionRecord,
  upsertExecutionRecordInList,
  parseExecutionRecordsFromMissionContext,
} from './executionRecords.js';

describe('executionRecords', () => {
  it('normalizes minimal record', () => {
    const r = normalizeExecutionRecord({
      executionId: 'e1',
      missionId: 'm1',
      actionType: 'update_product_catalog',
      status: 'running',
    });
    expect(r?.executionId).toBe('e1');
    expect(r?.missionId).toBe('m1');
  });

  it('upserts by executionId and preserves createdAt', () => {
    const first = normalizeExecutionRecord({
      executionId: 'e1',
      missionId: 'm1',
      actionType: 'launch_first_offer',
      status: 'queued',
      createdAt: 100,
      updatedAt: 100,
    });
    const second = normalizeExecutionRecord({
      executionId: 'e1',
      missionId: 'm1',
      actionType: 'launch_first_offer',
      status: 'completed',
      createdAt: 200,
      updatedAt: 300,
    });
    const merged = upsertExecutionRecordInList([first], second);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('completed');
    expect(merged[0].createdAt).toBe(100);
    expect(merged[0].updatedAt).toBe(300);
  });

  it('does not regress terminal record to running', () => {
    const completed = normalizeExecutionRecord({
      executionId: 'e1',
      missionId: 'm1',
      actionType: 'x',
      status: 'completed',
      createdAt: 1,
      updatedAt: 2,
    });
    const running = normalizeExecutionRecord({
      executionId: 'e1',
      missionId: 'm1',
      actionType: 'x',
      status: 'running',
      createdAt: 3,
      updatedAt: 4,
    });
    const merged = upsertExecutionRecordInList([completed], running);
    expect(merged[0].status).toBe('completed');
  });

  it('parses records bundle from mission context', () => {
    const records = parseExecutionRecordsFromMissionContext({
      performerExecutionRecords: {
        version: 1,
        records: [
          {
            executionId: 'e1',
            missionId: 'm1',
            actionType: 'launch_first_offer',
            status: 'blocked',
          },
        ],
      },
    });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('blocked');
  });
});
