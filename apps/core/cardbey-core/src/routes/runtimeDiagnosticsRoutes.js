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
import {
  getDeployMetadata,
  resolveCommitSha,
  resolveDeployEnvironment,
} from '../lib/deployMetadata.js';

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

const ingestRateLimitMax = (() => {
  const raw = Number(process.env.RUNTIME_DIAGNOSTICS_RATE_LIMIT_MAX);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
})();

const ingestRateLimit = rateLimit({
  windowMs: 60_000,
  max: ingestRateLimitMax,
  keyGenerator: (req) => req.userId || req.ip || 'unknown',
  message: 'Runtime diagnostics rate limit exceeded. Retry in {retryAfter}s.',
  code: 'runtime_diagnostics_rate_limit',
});

router.get('/version', async (_req, res) => {
  const storage = await readStorageSnapshot();
  const deploy = getDeployMetadata();
  return res.status(200).json({
    ok: true,
    service: 'cardbey-core',
    environment: resolveDeployEnvironment(),
    commitSha: resolveCommitSha(),
    buildTime: deploy.buildTime,
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
