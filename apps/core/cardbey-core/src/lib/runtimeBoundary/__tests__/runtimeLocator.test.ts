import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertSafeRuntimeSegments,
  ensureRuntimeDirectory,
  getLegacyAreaRoot,
  getRuntimeAreaDefinition,
  getRuntimeRoot,
  resolveRuntimePath,
} from '../runtimeLocator.js';

const ENV_KEYS = [
  'CARDBEY_RUNTIME_ROOT',
  'PERSISTENT_DISK_PATH',
  'UPLOADS_DIR',
  'BUSINESS_INGESTION_DIR',
  'PLATFORM_ACTIVITY_JSONL_DIR',
  'RUNTIME_DIAGNOSTICS_JSONL_DIR',
  'NODE_ENV',
  'VITEST_WORKER_ID',
] as const;

const PACKAGE_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('runtimeLocator Phase 1', () => {
  /** @type {Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>} */
  let prevEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    prevEnv = {};
    for (const key of ENV_KEYS) {
      prevEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const v = prevEnv[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  it('exposes area metadata (suffix, writable, backupPolicy, legacyRoot)', () => {
    const uploads = getRuntimeAreaDefinition('uploads');
    expect(uploads.suffix).toBe('uploads');
    expect(uploads.writable).toBe(true);
    expect(uploads.persistent).toBe(true);
    expect(uploads.backupPolicy).toBe('business');
    expect(uploads.areaEnv).toBe('UPLOADS_DIR');
    expect(uploads.legacyRoot).toBe('uploads');
  });

  it('uses tmp default when NODE_ENV=test and no CARDBEY_RUNTIME_ROOT', () => {
    const root = getRuntimeRoot();
    expect(root.startsWith(path.join(os.tmpdir(), 'cardbey-runtime-test'))).toBe(true);
    expect(resolveRuntimePath('uploads')).toBe(path.join(root, 'uploads'));
  });

  it('prefers CARDBEY_RUNTIME_ROOT over platform default', () => {
    process.env.CARDBEY_RUNTIME_ROOT = path.join(os.tmpdir(), 'cardbey-runtime-explicit');
    expect(getRuntimeRoot()).toBe(path.resolve(process.env.CARDBEY_RUNTIME_ROOT));
    expect(resolveRuntimePath('logs', 'api')).toBe(
      path.resolve(process.env.CARDBEY_RUNTIME_ROOT, 'logs', 'api'),
    );
  });

  it('prefers area env over CARDBEY_RUNTIME_ROOT', () => {
    process.env.CARDBEY_RUNTIME_ROOT = path.join(os.tmpdir(), 'cardbey-runtime-root');
    process.env.UPLOADS_DIR = path.join(os.tmpdir(), 'cardbey-uploads-override');
    expect(resolveRuntimePath('uploads')).toBe(path.resolve(process.env.UPLOADS_DIR));
    expect(resolveRuntimePath('uploads', 'media')).toBe(
      path.resolve(process.env.UPLOADS_DIR, 'media'),
    );
  });

  it('uses PERSISTENT_DISK_PATH when CARDBEY_RUNTIME_ROOT unset and not test', () => {
    process.env.NODE_ENV = 'production';
    process.env.PERSISTENT_DISK_PATH = path.join(os.tmpdir(), 'persistent-disk');
    expect(getRuntimeRoot()).toBe(
      path.resolve(process.env.PERSISTENT_DISK_PATH, 'cardbey-runtime'),
    );
  });

  it('rejects .. and absolute / separator segments', () => {
    expect(() => assertSafeRuntimeSegments(['..'])).toThrow(/\.\./);
    expect(() => resolveRuntimePath('cache', '..')).toThrow(/\.\./);
    expect(() => resolveRuntimePath('cache', 'a/b')).toThrow(/separators/);
    const abs = path.resolve(os.tmpdir(), 'abs-seg');
    expect(() => resolveRuntimePath('cache', abs)).toThrow(/absolute/);
  });

  it('read purpose falls back to legacy when preferred missing', () => {
    process.env.CARDBEY_RUNTIME_ROOT = path.join(os.tmpdir(), 'cardbey-runtime-missing');
    const legacy = getLegacyAreaRoot('development');
    const preferred = resolveRuntimePath('development', { purpose: 'write' });
    const readPath = resolveRuntimePath('development', { purpose: 'read' });
    if (fs.existsSync(preferred)) {
      expect(readPath).toBe(preferred);
    } else if (fs.existsSync(legacy)) {
      expect(readPath).toBe(legacy);
    } else {
      expect(readPath).toBe(preferred);
    }
  });

  it('diagnostics leaf env overrides PLATFORM_ACTIVITY_JSONL_DIR', () => {
    const leaf = path.join(os.tmpdir(), 'pa-jsonl-leaf');
    process.env.PLATFORM_ACTIVITY_JSONL_DIR = leaf;
    process.env.CARDBEY_RUNTIME_ROOT = path.join(os.tmpdir(), 'cardbey-runtime-root');
    expect(resolveRuntimePath('diagnostics', 'platform-activity')).toBe(path.resolve(leaf));
    expect(resolveRuntimePath('diagnostics', 'platform-activity', 'events.jsonl')).toBe(
      path.resolve(leaf, 'events.jsonl'),
    );
  });

  it('resolveRuntimePath never creates directories', () => {
    const root = path.join(os.tmpdir(), `cardbey-runtime-nocreate-${Date.now()}`);
    process.env.CARDBEY_RUNTIME_ROOT = root;
    const target = resolveRuntimePath('cache', 'explore');
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(root)).toBe(false);
  });

  it('ensureRuntimeDirectory creates only when called', () => {
    const root = path.join(os.tmpdir(), `cardbey-runtime-ensure-${Date.now()}`);
    process.env.CARDBEY_RUNTIME_ROOT = root;
    const dir = ensureRuntimeDirectory('cache', 'explore');
    expect(dir).toBe(path.resolve(root, 'cache', 'explore'));
    expect(fs.existsSync(dir)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('refuses preferred write under package src/', () => {
    process.env.CARDBEY_RUNTIME_ROOT = path.join(PACKAGE_SRC, 'forced-runtime-root');
    expect(() => resolveRuntimePath('cache', { purpose: 'write' })).toThrow(/src\//);
  });
});
