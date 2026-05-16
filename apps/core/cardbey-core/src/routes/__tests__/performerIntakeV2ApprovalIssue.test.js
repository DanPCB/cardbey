/**
 * Intake V2 POST / — approval_required stores preview and returns approval payload.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (_req, _res, next) => next(),
}));

vi.mock('../../lib/intake/intakeClassifier.js', () => ({
  classifyIntent: vi.fn(async () => ({
    executionPath: 'direct_action',
    tool: 'signage.publish-to-devices',
    confidence: 0.95,
    parameters: { playlistId: 'pl-1' },
  })),
  CONFIDENCE: { HIGH: 0.8, MEDIUM: 0.55, LOW: 0 },
  FALLBACK_CLARIFY: { clarifyOptions: [] },
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';
import { getIntakeApprovalPreview, clearIntakeApprovalPreviewStoreForTests } from '../../lib/intake/intakeApprovalPreviewStore.js';

function makeApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

describe('POST /api/performer/intake/v2 approval_required', () => {
  beforeEach(() => {
    clearIntakeApprovalPreviewStoreForTests();
  });

  afterEach(() => {
    clearIntakeApprovalPreviewStoreForTests();
  });

  it('returns approval envelope and persists preview for confirm', async () => {
    const app = makeApp({ id: 'user-signage', business: undefined });
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'Push this playlist to my screens',
        currentContext: { activeStoreId: 'store-signage-1' },
        history: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('approval_required');
    expect(res.body.tool).toBe('signage.publish-to-devices');
    expect(res.body.approval?.previewId).toBeTruthy();
    expect(res.body.approval?.requiresConfirmation).toBe(true);
    expect(res.body.approval?.impact?.length).toBeGreaterThan(0);

    const stored = getIntakeApprovalPreview(res.body.approval.previewId);
    expect(stored).toBeTruthy();
    expect(stored.tool).toBe('signage.publish-to-devices');
    expect(stored.actorKey).toBe('u:user-signage');
    expect(String(stored.executionParameters?.playlistId || '')).toBe('pl-1');
  });
});
