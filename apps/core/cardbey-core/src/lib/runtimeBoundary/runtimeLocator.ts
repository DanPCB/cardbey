/**
 * Runtime Locator (Phase 1) — single owner for runtime path resolution.
 *
 * Precedence (preferred / write destination):
 *   area-specific env → CARDBEY_RUNTIME_ROOT → platform-safe default
 *
 * resolveRuntimePath never creates directories.
 * Use ensureRuntimeDirectory when a caller must materialize a path.
 *
 * No writers are wired in Phase 1 — deleting this module restores prior behavior.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type RuntimeArea =
  | 'uploads'
  | 'logs'
  | 'diagnostics'
  | 'development'
  | 'missions'
  | 'evidence'
  | 'generatedArtifacts'
  | 'cache'
  | 'businessIngestionRuns';

export type RuntimeBackupPolicy = 'none' | 'runtime' | 'business';

/**
 * Internal area metadata — backup/retention hooks for later phases.
 * Not required for public call sites in Phase 1.
 */
export interface RuntimeAreaDefinition {
  area: RuntimeArea;
  /** Path under CARDBEY_RUNTIME_ROOT / platform default */
  suffix: string;
  writable: boolean;
  persistent: boolean;
  backupPolicy: RuntimeBackupPolicy;
  /** Env that overrides the entire area root (leaf semantics preserved). */
  areaEnv?: string;
  /**
   * Legacy root relative to package root or process.cwd().
   * Used only for read fallback / getLegacyAreaRoot.
   */
  legacyRoot?: string;
  /** Where legacyRoot is resolved from. Default: package. */
  legacyBase?: 'package' | 'cwd' | 'monorepo';
}

export type ResolveOptions = {
  /** Prefer write destination (default). */
  purpose?: 'write' | 'read';
  /** When purpose=read, search preferred then legacy. Default true for read. */
  legacyFallback?: boolean;
  /** Optional segments when using options-object form. */
  segments?: string[];
};

/** Leaf env overrides under diagnostics (existing production knobs). */
const DIAGNOSTICS_LEAF_ENV: Readonly<Record<string, string>> = {
  'platform-activity': 'PLATFORM_ACTIVITY_JSONL_DIR',
  'runtime-diagnostics': 'RUNTIME_DIAGNOSTICS_JSONL_DIR',
};

const AREA_DEFINITIONS: Readonly<Record<RuntimeArea, RuntimeAreaDefinition>> = {
  uploads: {
    area: 'uploads',
    suffix: 'uploads',
    writable: true,
    persistent: true,
    backupPolicy: 'business',
    areaEnv: 'UPLOADS_DIR',
    legacyRoot: 'uploads',
    legacyBase: 'cwd',
  },
  logs: {
    area: 'logs',
    suffix: 'logs',
    writable: true,
    persistent: false,
    backupPolicy: 'none',
    legacyRoot: 'logs',
    legacyBase: 'cwd',
  },
  diagnostics: {
    area: 'diagnostics',
    suffix: 'diagnostics',
    writable: true,
    persistent: true,
    backupPolicy: 'runtime',
    // Primary legacy root for the area; leaf envs override specific subpaths.
    legacyRoot: path.join('data', 'platformActivity'),
    legacyBase: 'package',
  },
  development: {
    area: 'development',
    suffix: 'development',
    writable: true,
    persistent: true,
    backupPolicy: 'runtime',
    legacyRoot: '.development-runtime',
    legacyBase: 'cwd',
  },
  missions: {
    area: 'missions',
    suffix: 'missions',
    writable: true,
    persistent: true,
    backupPolicy: 'runtime',
    legacyRoot: path.join('data', 'performerRequests'),
    legacyBase: 'package',
  },
  evidence: {
    area: 'evidence',
    suffix: 'evidence',
    writable: true,
    persistent: true,
    backupPolicy: 'runtime',
    legacyRoot: path.join('.development-runtime', 'evidence-files'),
    legacyBase: 'cwd',
  },
  generatedArtifacts: {
    area: 'generatedArtifacts',
    suffix: 'generated',
    writable: true,
    persistent: false,
    backupPolicy: 'none',
    legacyRoot: path.join('.development-workspaces', 'check-artifacts'),
    legacyBase: 'monorepo',
  },
  cache: {
    area: 'cache',
    suffix: 'cache',
    writable: true,
    persistent: false,
    backupPolicy: 'none',
    legacyRoot: path.join('src', '.cache'),
    legacyBase: 'package',
  },
  businessIngestionRuns: {
    area: 'businessIngestionRuns',
    suffix: path.join('domain', 'business-ingestion', 'runs'),
    writable: true,
    persistent: true,
    backupPolicy: 'business',
    areaEnv: 'BUSINESS_INGESTION_DIR',
    legacyRoot: path.join('data', 'businessIngestion'),
    legacyBase: 'package',
  },
};

export const RUNTIME_AREAS: readonly RuntimeArea[] = Object.freeze(
  Object.keys(AREA_DEFINITIONS) as RuntimeArea[],
);

function corePackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

function monorepoRootFromPackage(): string {
  return path.resolve(corePackageRoot(), '../../..');
}

function trimEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null) return undefined;
  const t = String(raw).trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Platform-safe default Runtime Root (no area suffix).
 * Does not create directories.
 */
export function getRuntimeRoot(): string {
  const explicit = trimEnv('CARDBEY_RUNTIME_ROOT');
  if (explicit) return path.resolve(explicit);

  const persistent = trimEnv('PERSISTENT_DISK_PATH');
  if (persistent) return path.resolve(persistent, 'cardbey-runtime');

  if (String(process.env.NODE_ENV ?? '').trim().toLowerCase() === 'test') {
    const worker = trimEnv('VITEST_WORKER_ID') ?? trimEnv('JEST_WORKER_ID') ?? '0';
    return path.join(os.tmpdir(), 'cardbey-runtime-test', worker);
  }

  return path.join(os.homedir(), '.cardbey', 'runtime');
}

export function getRuntimeAreaDefinition(area: RuntimeArea): RuntimeAreaDefinition {
  const def = AREA_DEFINITIONS[area];
  if (!def) {
    throw new Error(`Unknown RuntimeArea: ${String(area)}`);
  }
  return { ...def };
}

export function getLegacyAreaRoot(area: RuntimeArea): string {
  const def = getRuntimeAreaDefinition(area);
  if (!def.legacyRoot) {
    throw new Error(`RuntimeArea "${area}" has no legacyRoot`);
  }
  const base =
    def.legacyBase === 'cwd'
      ? process.cwd()
      : def.legacyBase === 'monorepo'
        ? monorepoRootFromPackage()
        : corePackageRoot();
  return path.resolve(base, def.legacyRoot);
}

/**
 * Reject path traversal and absolute fragments in caller-supplied segments.
 */
export function assertSafeRuntimeSegments(segments: string[]): void {
  for (const seg of segments) {
    if (typeof seg !== 'string' || seg.length === 0) {
      throw new Error('Runtime path segment must be a non-empty string');
    }
    if (path.isAbsolute(seg)) {
      throw new Error(`Runtime path segment must not be absolute: ${seg}`);
    }
    if (seg === '.' || seg === '..') {
      throw new Error(`Runtime path segment must not be '.' or '..': ${seg}`);
    }
    if (seg.includes('..')) {
      throw new Error(`Runtime path segment must not contain '..': ${seg}`);
    }
    if (/[/\\]/.test(seg)) {
      throw new Error(`Runtime path segment must not contain path separators: ${seg}`);
    }
  }
}

function assertPreferredNotUnderPackageSrc(resolved: string): void {
  const srcRoot = path.resolve(corePackageRoot(), 'src');
  const normalized = path.resolve(resolved);
  if (normalized === srcRoot || normalized.startsWith(`${srcRoot}${path.sep}`)) {
    throw new Error(
      'Runtime locator refuses preferred write paths under package src/ (use CARDBEY_RUNTIME_ROOT or area env)',
    );
  }
}

function joinUnder(root: string, segments: string[]): string {
  assertSafeRuntimeSegments(segments);
  return segments.length === 0 ? path.resolve(root) : path.resolve(root, ...segments);
}

function preferredAreaRoot(area: RuntimeArea): string {
  const def = getRuntimeAreaDefinition(area);
  if (def.areaEnv) {
    const override = trimEnv(def.areaEnv);
    if (override) return path.resolve(override);
  }
  return path.resolve(getRuntimeRoot(), def.suffix);
}

/**
 * Diagnostics leaf env: PLATFORM_ACTIVITY_JSONL_DIR / RUNTIME_DIAGNOSTICS_JSONL_DIR
 * override the leaf directory when the first segment matches.
 */
function tryDiagnosticsLeafOverride(
  segments: string[],
): { root: string; rest: string[] } | null {
  if (segments.length === 0) return null;
  const leaf = segments[0];
  const envName = DIAGNOSTICS_LEAF_ENV[leaf];
  if (!envName) return null;
  const override = trimEnv(envName);
  if (!override) return null;
  return { root: path.resolve(override), rest: segments.slice(1) };
}

function parseResolveArgs(
  parts: Array<string | ResolveOptions>,
): { segments: string[]; options: ResolveOptions } {
  if (parts.length === 0) {
    return { segments: [], options: {} };
  }
  const last = parts[parts.length - 1];
  const isOptions =
    last != null &&
    typeof last === 'object' &&
    !Array.isArray(last) &&
    ('purpose' in last || 'legacyFallback' in last || 'segments' in last);

  if (isOptions) {
    const options = last as ResolveOptions;
    const head = parts.slice(0, -1).filter((p): p is string => typeof p === 'string');
    const fromOpts = options.segments ?? [];
    return { segments: [...head, ...fromOpts], options };
  }

  return {
    segments: parts.filter((p): p is string => typeof p === 'string'),
    options: {},
  };
}

function pathExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Resolve a runtime path. Never creates directories.
 */
export function resolveRuntimePath(area: RuntimeArea, ...parts: Array<string | ResolveOptions>): string {
  const { segments, options } = parseResolveArgs(parts);
  const purpose = options.purpose ?? 'write';
  const legacyFallback = options.legacyFallback ?? purpose === 'read';

  let preferred: string;

  if (area === 'diagnostics') {
    const leaf = tryDiagnosticsLeafOverride(segments);
    if (leaf) {
      preferred = joinUnder(leaf.root, leaf.rest);
    } else {
      preferred = joinUnder(preferredAreaRoot(area), segments);
    }
  } else {
    preferred = joinUnder(preferredAreaRoot(area), segments);
  }

  if (purpose === 'write') {
    assertPreferredNotUnderPackageSrc(preferred);
  }

  if (purpose === 'read' && legacyFallback) {
    if (pathExists(preferred)) return preferred;
    // Leaf env already applied as preferred; if missing, try legacy layout.
    const legacyRoot = getLegacyAreaRoot(area);
    let legacyPath: string;
    if (area === 'diagnostics' && segments[0] === 'runtime-diagnostics') {
      // Historical writer: src/.cache/runtime-diagnostics
      legacyPath = joinUnder(path.resolve(corePackageRoot(), 'src', '.cache', 'runtime-diagnostics'), segments.slice(1));
    } else if (area === 'diagnostics' && segments[0] === 'platform-activity') {
      legacyPath = joinUnder(path.resolve(corePackageRoot(), 'data', 'platformActivity'), segments.slice(1));
    } else if (area === 'cache' && segments[0] === 'language-runtime') {
      legacyPath = joinUnder(path.resolve(corePackageRoot(), 'data', 'language-runtime'), segments.slice(1));
    } else {
      legacyPath = joinUnder(legacyRoot, segments);
    }
    if (pathExists(legacyPath)) return legacyPath;
  }

  return preferred;
}

/**
 * Explicitly create a writable area directory (and optional segments).
 * Opt-in — resolveRuntimePath never does this.
 */
export function ensureRuntimeDirectory(area: RuntimeArea, ...segments: string[]): string {
  const def = getRuntimeAreaDefinition(area);
  if (!def.writable) {
    throw new Error(`RuntimeArea "${area}" is not writable`);
  }
  const dir = resolveRuntimePath(area, ...segments, { purpose: 'write' });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
