/**
 * Route-level coverage: websiteEditingRoutes design-projection (C1 runtime).
 * Mounts the same router createApp/server mount at /api/stores.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.userId = req.headers['x-test-user'] || 'user_owner';
    req.user = {
      id: req.userId,
      role: req.headers['x-test-role'] || 'owner',
      email: `${req.userId}@example.test`,
    };
    next();
  },
}));

const projectionMock = vi.fn();
vi.mock('../../services/websiteEditing/buildDesignPresentationProjection.js', () => ({
  buildDesignPresentationProjection: (...args) => projectionMock(...args),
}));

vi.mock('../../services/websiteEditing/resolveWebsiteEditingContext.js', () => ({
  resolveWebsiteEditingContext: vi.fn(async (_prisma, opts) => {
    if (opts.userId === 'user_other') {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      err.code = 'forbidden';
      throw err;
    }
    return {
      storeId: opts.storeId,
      draftId: 'draft_c1',
      editingKind: 'unpublished_revision',
      fingerprint: 'fp1',
    };
  }),
}));

const businessFind = vi.fn();
const draftFind = vi.fn();
vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: () => ({
    business: { findUnique: (...a) => businessFind(...a) },
    draftStore: { findUnique: (...a) => draftFind(...a) },
  }),
}));

vi.mock('../../config/features.js', () => ({
  default: {
    websiteEditingDesignAdapter: {
      get v1() {
        return process.env.ENABLE_WEBSITE_EDITING_DESIGN_ADAPTER_V1 === 'true';
      },
    },
  },
}));

describe('websiteEditingRoutes design-projection (mounted)', () => {
  let app;
  let prevFlag;

  beforeAll(async () => {
    prevFlag = process.env.ENABLE_WEBSITE_EDITING_DESIGN_ADAPTER_V1;
    process.env.ENABLE_WEBSITE_EDITING_DESIGN_ADAPTER_V1 = 'true';
    const router = (await import('../websiteEditingRoutes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/stores', router);
    businessFind.mockResolvedValue({
      id: 'store_c1',
      stylePreferences: { miniWebsite: { theme: { templateId: 'warm' } } },
      publishedAt: null,
      isActive: true,
      slug: 'c1-fixture',
    });
    draftFind.mockResolvedValue({
      id: 'draft_c1',
      preview: { website: { theme: { templateId: 'cool' } } },
    });
    projectionMock.mockImplementation(({ flagEnabled, business, draft, editingContext }) => ({
      ok: true,
      adapterId: 'design',
      readiness: 'SOURCE_CONFLICT',
      projection: {
        version: 'design_presentation_projection.v1',
        storeId: editingContext?.storeId || business?.id,
        draftId: editingContext?.draftId || draft?.id,
      },
      conflicts: [{ field: 'templateId' }],
      diagnostics: ['template_mismatch'],
    }));
  });

  afterAll(() => {
    if (prevFlag == null) delete process.env.ENABLE_WEBSITE_EDITING_DESIGN_ADAPTER_V1;
    else process.env.ENABLE_WEBSITE_EDITING_DESIGN_ADAPTER_V1 = prevFlag;
  });

  it('returns design_presentation_projection.v1 for owner when flag ON', async () => {
    const res = await request(app)
      .get('/api/stores/store_c1/website-editing/design-projection')
      .set('x-test-user', 'user_owner');
    expect(res.status).toBe(200);
    expect(res.body.projection.version).toBe('design_presentation_projection.v1');
    expect(res.body.projection.storeId).toBe('store_c1');
    expect(res.body.projection.draftId).toBe('draft_c1');
    expect(res.body.conflicts?.length).toBeGreaterThan(0);
  });

  it('does not call allowInit (resolve uses allowInit false)', async () => {
    const { resolveWebsiteEditingContext } = await import(
      '../../services/websiteEditing/resolveWebsiteEditingContext.js'
    );
    expect(resolveWebsiteEditingContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowInit: false }),
    );
  });

  it('rejects cross-store owner', async () => {
    const res = await request(app)
      .get('/api/stores/store_c1/website-editing/design-projection')
      .set('x-test-user', 'user_other');
    expect(res.status).toBe(403);
  });

  it('returns NOT_ENABLED when flag OFF', async () => {
    process.env.ENABLE_WEBSITE_EDITING_DESIGN_ADAPTER_V1 = 'false';
    const res = await request(app)
      .get('/api/stores/store_c1/website-editing/design-projection')
      .set('x-test-user', 'user_owner');
    expect(res.status).toBe(200);
    expect(res.body.readiness).toBe('NOT_ENABLED');
    expect(res.body.projection).toBeNull();
    process.env.ENABLE_WEBSITE_EDITING_DESIGN_ADAPTER_V1 = 'true';
  });
});
