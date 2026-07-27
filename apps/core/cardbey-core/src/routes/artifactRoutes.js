/**
 * Universal Artifact Factory API — POST /api/artifacts/create
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  approveArtifactExecution,
  executeArtifact,
  isUniversalArtifactFactoryEnabled,
  listMissionArtifacts,
  parseCreateArtifactPayload,
} from '../lib/artifactFactory/ArtifactFactory.js';
import { resolveRuntimePrincipal } from '../lib/runtime/resolveRuntimePrincipal.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    enabled: isUniversalArtifactFactoryEnabled(),
    service: 'universal_artifact_factory',
  });
});

router.post('/create', requireAuth, async (req, res) => {
  if (!isUniversalArtifactFactoryEnabled()) {
    return res.status(503).json({
      ok: false,
      error: { code: 'uaf_disabled', message: 'Universal Artifact Factory is not enabled' },
    });
  }

  const payload = parseCreateArtifactPayload(req.body);
  if (!payload) {
    return res.status(400).json({
      ok: false,
      error: { code: 'invalid_payload', message: 'artifactType, objective, and context are required' },
    });
  }

  const principal = resolveRuntimePrincipal(req);
  if (principal.kind !== 'authenticated') {
    return res.status(401).json({
      ok: false,
      error: { code: 'auth_required', message: 'Sign in to create artifacts' },
    });
  }

  const result = await executeArtifact({
    ...payload,
    owner: principal.userId,
    userId: principal.userId,
    req,
    skipReview: req.body?.skipReview === true,
    autoPublish: req.body?.autoPublish === true,
  });

  const status = result.ok ? 200 : result.status?.includes('awaiting') ? 202 : 500;
  return res.status(status).json(result);
});

router.post('/:executionId/approve', requireAuth, async (req, res) => {
  if (!isUniversalArtifactFactoryEnabled()) {
    return res.status(503).json({ ok: false, error: { code: 'uaf_disabled' } });
  }

  const execution = req.body?.execution;
  if (!execution?.executionId || !execution?.definition) {
    return res.status(400).json({ ok: false, error: { code: 'invalid_execution' } });
  }

  const approved = req.body?.approved !== false;
  const result = await approveArtifactExecution(execution, {
    approved,
    req,
    autoPublish: req.body?.autoPublish === true,
  });
  return res.json(result);
});

router.get('/mission/:missionId', requireAuth, async (req, res) => {
  const missionId = String(req.params.missionId ?? '').trim();
  if (!missionId) return res.status(400).json({ ok: false, error: { code: 'mission_required' } });
  const data = await listMissionArtifacts(missionId);
  return res.json({ ok: true, ...data });
});

export default router;
