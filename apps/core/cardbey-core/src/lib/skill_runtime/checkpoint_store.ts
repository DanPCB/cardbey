/**
 * Checkpoint persistence for the skill runtime.
 *
 * A `Checkpoint` carries a `Map` and a `Date`, neither of which survive JSON
 * round-trips cleanly, so this module owns (de)serialization. Two stores are
 * provided:
 *   - `InMemoryCheckpointStore`: zero-dependency, used by tests and as a
 *     no-Postgres fallback.
 *   - `PostgresCheckpointStore`: JSONB-backed, upserted per skill. It takes an
 *     injected `pg`-compatible client (`{ query }`) so this package adds no new
 *     hard dependency and stays unit-testable.
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '../logger.js';
import type { Checkpoint, SerializedCheckpoint } from './types.js';

const log = createLogger('CheckpointStore');

export interface CheckpointStore {
  /** Upsert the checkpoint for its skill. Returns the stored row id. */
  save(checkpoint: Checkpoint): Promise<string>;
  /** Load a checkpoint by stored row id. */
  load(id: string): Promise<Checkpoint | null>;
  /** All checkpoints for a skill, most recent first. */
  list(skillId: string): Promise<Checkpoint[]>;
}

// ─────────────────────────────── Serialization ─────────────────────────────

export function serializeCheckpoint(checkpoint: Checkpoint): SerializedCheckpoint {
  return {
    skillId: checkpoint.skillId,
    intent: checkpoint.intent,
    state: checkpoint.state,
    completedSteps: [...checkpoint.completedSteps],
    currentStepIndex: checkpoint.currentStepIndex,
    context: checkpoint.context,
    stepResults: Object.fromEntries(checkpoint.stepResults),
    timestamp: checkpoint.timestamp.toISOString(),
  };
}

export function deserializeCheckpoint(raw: SerializedCheckpoint): Checkpoint {
  return {
    skillId: raw.skillId,
    intent: raw.intent,
    state: raw.state,
    completedSteps: Array.isArray(raw.completedSteps) ? [...raw.completedSteps] : [],
    currentStepIndex: raw.currentStepIndex ?? 0,
    context: raw.context,
    stepResults: new Map(Object.entries(raw.stepResults ?? {})),
    timestamp: new Date(raw.timestamp),
  };
}

// ──────────────────────────── In-memory store ──────────────────────────────

interface StoredRow {
  id: string;
  skillId: string;
  serialized: SerializedCheckpoint;
  createdAt: number;
}

/**
 * In-memory store. One current row per skill (upsert by `skillId`), mirroring
 * the Postgres unique-on-skill_id behaviour so tests exercise the same shape.
 */
export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly bySkillId = new Map<string, StoredRow>();
  private readonly byId = new Map<string, StoredRow>();

  async save(checkpoint: Checkpoint): Promise<string> {
    const existing = this.bySkillId.get(checkpoint.skillId);
    const id = existing?.id ?? randomUUID();
    const row: StoredRow = {
      id,
      skillId: checkpoint.skillId,
      // Round-trip through serialization so callers can't mutate stored state.
      serialized: serializeCheckpoint(checkpoint),
      createdAt: existing?.createdAt ?? Date.now(),
    };
    this.bySkillId.set(checkpoint.skillId, row);
    this.byId.set(id, row);
    return id;
  }

  async load(id: string): Promise<Checkpoint | null> {
    const row = this.byId.get(id);
    return row ? deserializeCheckpoint(row.serialized) : null;
  }

  async list(skillId: string): Promise<Checkpoint[]> {
    const row = this.bySkillId.get(skillId);
    return row ? [deserializeCheckpoint(row.serialized)] : [];
  }

  clear(): void {
    this.bySkillId.clear();
    this.byId.clear();
  }
}

// ───────────────────────────── Postgres store ──────────────────────────────

/** Minimal `pg`-compatible surface. Satisfied by `pg.Pool` and `pg.Client`. */
export interface PgQueryable {
  query(text: string, params?: any[]): Promise<{ rows: any[] }>;
}

export interface PostgresCheckpointStoreOptions {
  /** Table name; defaults to `skill_checkpoints`. */
  table?: string;
}

/**
 * Postgres-backed store using JSONB and an upsert keyed by `skill_id`. The
 * table is created by the migration in `./migrations/`; this class never runs
 * DDL at runtime.
 */
export class PostgresCheckpointStore implements CheckpointStore {
  private readonly client: PgQueryable;
  private readonly table: string;

  constructor(client: PgQueryable, options: PostgresCheckpointStoreOptions = {}) {
    if (!client || typeof client.query !== 'function') {
      throw new Error('PostgresCheckpointStore requires a pg-compatible client with query()');
    }
    this.client = client;
    // Identifier is constrained to a safe charset (never user input) so it can
    // be interpolated; values always go through parameterized placeholders.
    this.table = sanitizeIdentifier(options.table ?? 'skill_checkpoints');
  }

  async save(checkpoint: Checkpoint): Promise<string> {
    const serialized = serializeCheckpoint(checkpoint);
    const sql = `
      INSERT INTO ${this.table} (skill_id, checkpoint, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (skill_id)
      DO UPDATE SET checkpoint = EXCLUDED.checkpoint, updated_at = NOW()
      RETURNING id
    `;
    try {
      const { rows } = await this.client.query(sql, [
        checkpoint.skillId,
        JSON.stringify(serialized),
      ]);
      return String(rows[0]?.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('save failed', { skillId: checkpoint.skillId, error: message });
      throw err;
    }
  }

  async load(id: string): Promise<Checkpoint | null> {
    const sql = `SELECT checkpoint FROM ${this.table} WHERE id = $1 LIMIT 1`;
    const { rows } = await this.client.query(sql, [id]);
    if (!rows.length) return null;
    return deserializeCheckpoint(parseCheckpointColumn(rows[0].checkpoint));
  }

  async list(skillId: string): Promise<Checkpoint[]> {
    const sql = `
      SELECT checkpoint FROM ${this.table}
      WHERE skill_id = $1
      ORDER BY created_at DESC
    `;
    const { rows } = await this.client.query(sql, [skillId]);
    return rows.map((row) => deserializeCheckpoint(parseCheckpointColumn(row.checkpoint)));
  }
}

/** JSONB columns come back as objects from `pg`, but tolerate string too. */
function parseCheckpointColumn(value: unknown): SerializedCheckpoint {
  if (typeof value === 'string') return JSON.parse(value) as SerializedCheckpoint;
  return value as SerializedCheckpoint;
}

function sanitizeIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: "${name}"`);
  }
  return name;
}
