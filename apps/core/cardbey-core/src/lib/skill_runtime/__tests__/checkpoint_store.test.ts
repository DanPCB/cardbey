import { describe, it, expect } from 'vitest';
import {
  InMemoryCheckpointStore,
  PostgresCheckpointStore,
  serializeCheckpoint,
  deserializeCheckpoint,
  type PgQueryable,
} from '../checkpoint_store.js';
import type { Checkpoint } from '../types.js';

function sampleCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    skillId: 'skill_1',
    intent: 'setup_loyalty_program',
    state: 'paused',
    completedSteps: ['a', 'b'],
    currentStepIndex: 2,
    context: {
      query: 'Setup a loyalty campaign',
      userId: 'u1',
      conversationId: 'c1',
      userHasProducts: true,
      existingSegments: ['vip'],
      metadata: { source: 'feed' },
    },
    stepResults: new Map<string, any>([
      ['a', { tiers: 3 }],
      ['b', { points: 1 }],
    ]),
    timestamp: new Date('2026-06-06T08:00:00.000Z'),
    ...overrides,
  };
}

describe('checkpoint serialization', () => {
  it('round-trips Map and Date through serialize/deserialize', () => {
    const cp = sampleCheckpoint();
    const serialized = serializeCheckpoint(cp);

    expect(serialized.stepResults).toEqual({ a: { tiers: 3 }, b: { points: 1 } });
    expect(serialized.timestamp).toBe('2026-06-06T08:00:00.000Z');
    expect(JSON.parse(JSON.stringify(serialized))).toBeTruthy(); // JSONB-safe

    const restored = deserializeCheckpoint(JSON.parse(JSON.stringify(serialized)));
    expect(restored.stepResults).toBeInstanceOf(Map);
    expect(restored.stepResults.get('a')).toEqual({ tiers: 3 });
    expect(restored.timestamp).toBeInstanceOf(Date);
    expect(restored.timestamp.toISOString()).toBe('2026-06-06T08:00:00.000Z');
    expect(restored.context.metadata.source).toBe('feed');
  });
});

describe('InMemoryCheckpointStore', () => {
  it('saves, loads by id, and lists by skill', async () => {
    const store = new InMemoryCheckpointStore();
    const id = await store.save(sampleCheckpoint());

    const loaded = await store.load(id);
    expect(loaded?.skillId).toBe('skill_1');
    expect(loaded?.completedSteps).toEqual(['a', 'b']);
    expect(loaded?.stepResults.get('b')).toEqual({ points: 1 });

    const listed = await store.list('skill_1');
    expect(listed).toHaveLength(1);
    expect(listed[0].state).toBe('paused');
  });

  it('upserts (one current row per skill, stable id)', async () => {
    const store = new InMemoryCheckpointStore();
    const id1 = await store.save(sampleCheckpoint({ currentStepIndex: 1 }));
    const id2 = await store.save(sampleCheckpoint({ currentStepIndex: 2, state: 'completed' }));

    expect(id1).toBe(id2);
    const listed = await store.list('skill_1');
    expect(listed).toHaveLength(1);
    expect(listed[0].currentStepIndex).toBe(2);
    expect(listed[0].state).toBe('completed');
  });

  it('returns null/empty for unknown ids and skills', async () => {
    const store = new InMemoryCheckpointStore();
    expect(await store.load('nope')).toBeNull();
    expect(await store.list('nope')).toEqual([]);
  });
});

describe('PostgresCheckpointStore', () => {
  function fakeClient() {
    const calls: Array<{ text: string; params?: any[] }> = [];
    let nextRows: any[] = [];
    const client: PgQueryable = {
      query: async (text: string, params?: any[]) => {
        calls.push({ text, params });
        return { rows: nextRows };
      },
    };
    return {
      client,
      calls,
      setRows: (rows: any[]) => { nextRows = rows; },
    };
  }

  it('save issues an upsert keyed on skill_id and returns the row id', async () => {
    const fake = fakeClient();
    fake.setRows([{ id: 'row-uuid-1' }]);
    const store = new PostgresCheckpointStore(fake.client);

    const id = await store.save(sampleCheckpoint());
    expect(id).toBe('row-uuid-1');

    const call = fake.calls[0];
    expect(call.text).toMatch(/INSERT INTO skill_checkpoints/);
    expect(call.text).toMatch(/ON CONFLICT \(skill_id\)/);
    expect(call.text).toMatch(/\$2::jsonb/);
    expect(call.params?.[0]).toBe('skill_1');
    // JSONB payload is passed as a JSON string.
    const payload = JSON.parse(call.params?.[1]);
    expect(payload.intent).toBe('setup_loyalty_program');
    expect(payload.stepResults.a).toEqual({ tiers: 3 });
  });

  it('load parses a JSONB object column back into a Checkpoint', async () => {
    const fake = fakeClient();
    const serialized = serializeCheckpoint(sampleCheckpoint());
    fake.setRows([{ checkpoint: serialized }]); // pg returns JSONB as an object
    const store = new PostgresCheckpointStore(fake.client);

    const cp = await store.load('row-uuid-1');
    expect(cp?.stepResults).toBeInstanceOf(Map);
    expect(cp?.stepResults.get('a')).toEqual({ tiers: 3 });
    expect(cp?.timestamp).toBeInstanceOf(Date);
  });

  it('load tolerates a JSONB column returned as a string', async () => {
    const fake = fakeClient();
    const serialized = serializeCheckpoint(sampleCheckpoint());
    fake.setRows([{ checkpoint: JSON.stringify(serialized) }]);
    const store = new PostgresCheckpointStore(fake.client);

    const cp = await store.load('row-uuid-1');
    expect(cp?.intent).toBe('setup_loyalty_program');
  });

  it('load returns null when no row exists', async () => {
    const fake = fakeClient();
    fake.setRows([]);
    const store = new PostgresCheckpointStore(fake.client);
    expect(await store.load('missing')).toBeNull();
  });

  it('rejects an unsafe table identifier', () => {
    const fake = fakeClient();
    expect(() => new PostgresCheckpointStore(fake.client, { table: 'bad; DROP TABLE' })).toThrow(
      /Unsafe SQL identifier/
    );
  });

  it('requires a query-capable client', () => {
    // @ts-expect-error intentionally invalid client
    expect(() => new PostgresCheckpointStore({})).toThrow(/pg-compatible client/);
  });
});
