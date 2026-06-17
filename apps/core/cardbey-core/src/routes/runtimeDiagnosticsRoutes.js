/**
 * Runtime Error Reflection Layer — ingest + version handshake + recent observations.
 * POST /api/runtime/diagnostics
 * GET  /api/runtime/version
 * GET  /api/runtime/diagnostics/recent (admin)
 */

import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { requireSuperAdmin } from '../lib/authorization.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  ingestRuntimeDiagnostic,
  isRuntimeDiagnosticsEnabled,
  listRecentRuntimeDiagnostics,
  parseDiagnosticIngestBody,
} from '../lib/runtimeDiagnostics/index.js';

const router = express.Router();

function readPackageVersion() {
  try {
    const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function resolveCommitSha() {
  return (
    process.env.RENDER_GIT_COMMIT?.trim() ||
    process.env.GIT_COMMIT?.trim() ||
    process.env.COMMIT_SHA?.trim() ||
    'unknown'
  );
}

function resolveEnvironment() {
  const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'production') return 'production';
  if (String(process.env.RENDER_SERVICE_NAME || '').includes('staging')) return 'staging';
  return nodeEnv === 'test' ? 'development' : nodeEnv;
}

async function readStorageSnapshot() {
  try {
    const { resolveStorageDriver, getStorageConfig } = await import('../lib/storage/index.js');
    const cfg = getStorageConfig();
    return {
      driver: resolveStorageDriver(),
      publicBaseUrl: cfg.publicBaseUrl || null,
      bucket: cfg.bucket || null,
    };
  } catch {
    return { driver: 'unknown', publicBaseUrl: null, bucket: null };
  }
}

const ingestRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req) => req.userId || req.ip || 'unknown',
  message: 'Runtime diagnostics rate limit exceeded. Retry in {retryAfter}s.',
  code: 'runtime_diagnostics_rate_limit',
});

router.get('/version', async (_req, res) => {
  const storage = await readStorageSnapshot();
  return res.status(200).json({
    ok: true,
    service: 'cardbey-core',
    environment: resolveEnvironment(),
    commitSha: resolveCommitSha(),
    buildTime: process.env.BUILD_TIME?.trim() || null,
    version: readPackageVersion(),
    runtimeDiagnosticsEnabled: isRuntimeDiagnosticsEnabled(),
    storage,
  });
});

router.post(
  '/diagnostics',
  ingestRateLimit,
  optionalAuth,
  (req, res) => {
    if (!isRuntimeDiagnosticsEnabled()) {
      return res.status(503).json({
        ok: false,
        error: 'runtime_diagnostics_disabled',
        message: 'Runtime diagnostics ingestion is disabled.',
      });
    }

    const parsed = parseDiagnosticIngestBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ ok: false, error: parsed.error });
    }

    const result = ingestRuntimeDiagnostic(parsed.payload, {
      userId: req.userId ?? null,
      ip: req.ip,
    });

    if (!result.ok) {
      return res.status(503).json({ ok: false, error: 'runtime_diagnostics_disabled' });
    }

    return res.status(201).json({
      ok: true,
      diagnosticId: result.diagnosticId,
      classification: result.classification,
      cursorPacket: result.cursorPacket,
    });
  },
);

router.get(
  '/diagnostics/recent',
  requireAuth,
  requireSuperAdmin,
  (req, res) => {
    const rows = listRecentRuntimeDiagnostics({
      storeId: typeof req.query.storeId === 'string' ? req.query.storeId.trim() : undefined,
      missionId: typeof req.query.missionId === 'string' ? req.query.missionId.trim() : undefined,
      severity: typeof req.query.severity === 'string' ? req.query.severity.trim() : undefined,
      limit: Number(req.query.limit) || 50,
    });
    return res.status(200).json({ ok: true, diagnostics: rows });
  },
);

export default router;
