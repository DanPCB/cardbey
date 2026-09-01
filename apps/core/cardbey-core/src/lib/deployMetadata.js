/**
 * Deploy truth — commit SHA and build time for health / diagnostics.
 * Resolution order: RENDER_GIT_COMMIT → GIT_COMMIT → COMMIT_SHA → data/build-metadata.json
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD_METADATA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/build-metadata.json',
);

/** @type {Record<string, string> | null} */
let cachedFileMetadata = null;
let fileMetadataLoaded = false;

function loadBuildMetadataFile() {
  if (fileMetadataLoaded) return cachedFileMetadata;
  fileMetadataLoaded = true;
  cachedFileMetadata = null;
  try {
    if (existsSync(BUILD_METADATA_PATH)) {
      cachedFileMetadata = JSON.parse(readFileSync(BUILD_METADATA_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('[deployMetadata] Could not read build-metadata.json:', err?.message || err);
  }
  return cachedFileMetadata;
}

/** @returns {string} */
export function resolveCommitSha() {
  const fromEnv =
    process.env.RENDER_GIT_COMMIT?.trim() ||
    process.env.GIT_COMMIT?.trim() ||
    process.env.COMMIT_SHA?.trim() ||
    '';
  if (fromEnv) return fromEnv;

  const file = loadBuildMetadataFile();
  const fromFile = file?.commitSha?.trim() || file?.gitCommit?.trim() || '';
  return fromFile || 'unknown';
}

/** @returns {string | null} */
export function resolveBuildTime() {
  const fromEnv = process.env.BUILD_TIME?.trim();
  if (fromEnv) return fromEnv;

  const file = loadBuildMetadataFile();
  return file?.buildTime?.trim() || null;
}

/** @returns {'production' | 'staging' | 'development' | string} */
export function resolveDeployEnvironment() {
  const deployEnv = String(
    process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '',
  )
    .trim()
    .toLowerCase();
  if (deployEnv.includes('staging')) return 'staging';

  const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'production') return 'production';
  return nodeEnv === 'test' ? 'development' : nodeEnv;
}

/**
 * Deploy metadata for /api/health?full=true and runtime diagnostics.
 * @returns {{ commitSha: string, buildTime: string | null, environment: string, source: string }}
 */
export function getDeployMetadata() {
  let source = 'unknown';
  if (process.env.RENDER_GIT_COMMIT?.trim()) source = 'RENDER_GIT_COMMIT';
  else if (process.env.GIT_COMMIT?.trim()) source = 'GIT_COMMIT';
  else if (process.env.COMMIT_SHA?.trim()) source = 'COMMIT_SHA';
  else {
    const file = loadBuildMetadataFile();
    if (file?.commitSha?.trim() || file?.gitCommit?.trim()) source = 'build-metadata.json';
  }

  return {
    commitSha: resolveCommitSha(),
    buildTime: resolveBuildTime(),
    environment: resolveDeployEnvironment(),
    source,
  };
}
