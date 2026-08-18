/**
 * Flag-gated Global Live × Cnet HTTP routes.
 */

import { Router } from 'express';
import { requireAuth, requireAdmin, requireStoreOwner } from '../../middleware/auth.js';
import { Features } from '../../config/features.js';
import { LIVE_CNET_ERROR_CODES, LIVE_CNET_EVENTS } from './domain.js';
import {
  activateCampaign,
  assignPlacement,
  consumeHandoffToken,
  createCampaign,
  getCampaign,
  getCampaignMetrics,
  pauseCampaign,
  recordContractEvent,
} from './service.js';
import {
  getCampaignAnalytics,
  getCampaignHealth,
  listCampaigns,
  listEligibleDevices,
  previewCampaign,
  projectPublicManifest,
  schedulePlacement,
  withdrawPlacement,
} from './operator.js';

function sendError(res, err) {
  const status = err?.status || 400;
  return res.status(status).json({
    ok: false,
    error: err?.code || LIVE_CNET_ERROR_CODES.LIVE_CNET_INVALID,
    message: err?.message || 'Live Cnet error',
  });
}

function requireCnet(req, res, next) {
  if (!Features.liveMarket.cnetContractV1) {
    return res.status(403).json({
      ok: false,
      error: LIVE_CNET_ERROR_CODES.LIVE_CNET_DISABLED,
      message: 'Live Cnet contract is disabled',
    });
  }
  next();
}

export const liveCnetOwnerRoutes = Router({ mergeParams: true });
liveCnetOwnerRoutes.use(requireCnet);

liveCnetOwnerRoutes.post(
  '/:storeId/live-cnet/campaigns',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const campaign = await createCampaign({
        storeId: req.params.storeId,
        sessionId: req.body?.sessionId,
        hostUserId: req.userId,
      });
      return res.status(201).json({ ok: true, campaign });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.get(
  '/:storeId/live-cnet/campaigns',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const campaigns = await listCampaigns({
        storeId: req.params.storeId,
        sessionId: req.query?.sessionId || null,
      });
      return res.json({ ok: true, campaigns });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.get(
  '/:storeId/live-cnet/eligible-devices',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const devices = await listEligibleDevices({
        storeId: req.params.storeId,
        campaignPublicRef: req.query?.campaignPublicRef || null,
      });
      return res.json({ ok: true, devices });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.get(
  '/:storeId/live-cnet/campaigns/:publicRef',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const campaign = await getCampaign({
        storeId: req.params.storeId,
        publicRef: req.params.publicRef,
      });
      return res.json({ ok: true, campaign });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.post(
  '/:storeId/live-cnet/campaigns/:publicRef/activate',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const campaign = await activateCampaign({
        storeId: req.params.storeId,
        publicRef: req.params.publicRef,
      });
      return res.json({ ok: true, campaign });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.post(
  '/:storeId/live-cnet/campaigns/:publicRef/pause',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const campaign = await pauseCampaign({
        storeId: req.params.storeId,
        publicRef: req.params.publicRef,
      });
      return res.json({ ok: true, campaign });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.post(
  '/:storeId/live-cnet/campaigns/:publicRef/placements',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const campaign = await assignPlacement({
        storeId: req.params.storeId,
        campaignPublicRef: req.params.publicRef,
        deviceId: req.body?.deviceId,
        locationLabel: req.body?.locationLabel,
        validFrom: req.body?.validFrom,
        validUntil: req.body?.validUntil,
      });
      return res.status(201).json({ ok: true, campaign });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.get(
  '/:storeId/live-cnet/campaigns/:publicRef/metrics',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const metrics = await getCampaignMetrics({
        storeId: req.params.storeId,
        publicRef: req.params.publicRef,
      });
      return res.json({ ok: true, metrics });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.get(
  '/:storeId/live-cnet/campaigns/:publicRef/preview',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const preview = await previewCampaign({
        storeId: req.params.storeId,
        publicRef: req.params.publicRef,
      });
      return res.json({ ok: true, preview });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.get(
  '/:storeId/live-cnet/campaigns/:publicRef/health',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const health = await getCampaignHealth({
        storeId: req.params.storeId,
        publicRef: req.params.publicRef,
      });
      return res.json({ ok: true, health });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.get(
  '/:storeId/live-cnet/campaigns/:publicRef/analytics',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const analytics = await getCampaignAnalytics({
        storeId: req.params.storeId,
        publicRef: req.params.publicRef,
      });
      return res.json({ ok: true, analytics });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.patch(
  '/:storeId/live-cnet/campaigns/:publicRef/placements/:placementPublicCode',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const campaign = await schedulePlacement({
        storeId: req.params.storeId,
        campaignPublicRef: req.params.publicRef,
        placementPublicCode: req.params.placementPublicCode,
        validFrom: req.body?.validFrom,
        validUntil: req.body?.validUntil,
        locationLabel: req.body?.locationLabel,
      });
      return res.json({ ok: true, campaign });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveCnetOwnerRoutes.post(
  '/:storeId/live-cnet/campaigns/:publicRef/placements/:placementPublicCode/withdraw',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const campaign = await withdrawPlacement({
        storeId: req.params.storeId,
        campaignPublicRef: req.params.publicRef,
        placementPublicCode: req.params.placementPublicCode,
      });
      return res.json({ ok: true, campaign });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

export const liveCnetAdminRoutes = Router({ mergeParams: true });
liveCnetAdminRoutes.use(requireCnet, requireAuth, requireAdmin);

liveCnetAdminRoutes.post('/campaigns/:publicRef/pause', async (req, res) => {
  try {
    const { getPrismaClient } = await import('../prisma.js');
    const db = getPrismaClient();
    const row = await db.globalLiveCnetCampaign.findUnique({
      where: { publicRef: String(req.params.publicRef) },
    });
    if (!row) {
      return res.status(404).json({ ok: false, error: LIVE_CNET_ERROR_CODES.LIVE_CNET_CAMPAIGN_NOT_FOUND });
    }
    const campaign = await pauseCampaign({ storeId: row.storeId, publicRef: row.publicRef });
    return res.json({ ok: true, campaign });
  } catch (err) {
    return sendError(res, err);
  }
});

export const liveCnetPublicRoutes = Router({ mergeParams: true });
liveCnetPublicRoutes.use(requireCnet);

liveCnetPublicRoutes.get('/h/:token', async (req, res) => {
  try {
    const { location } = await consumeHandoffToken({ token: req.params.token });
    return res.redirect(302, location);
  } catch (err) {
    return sendError(res, err);
  }
});

liveCnetPublicRoutes.get('/manifest/:token', async (req, res) => {
  try {
    const projection = await projectPublicManifest({ token: req.params.token });
    return res.json(projection);
  } catch (err) {
    return sendError(res, err);
  }
});

liveCnetPublicRoutes.post('/events', async (req, res) => {
  try {
    const eventType = String(req.body?.eventType || '');
    if (eventType !== LIVE_CNET_EVENTS.ONLINE_JOIN && eventType !== LIVE_CNET_EVENTS.STORE_ACTION) {
      return res.status(400).json({
        ok: false,
        error: LIVE_CNET_ERROR_CODES.LIVE_CNET_INVALID,
        message: 'Unsupported public event',
      });
    }
    const result = await recordContractEvent({
      eventType,
      attributionToken: req.body?.attributionToken,
      extraDedupe: `${eventType}:${req.body?.attributionToken || 'na'}:${req.body?.actionType || ''}:${Math.floor(Date.now() / 5000)}`,
      idempotencyKey: req.body?.idempotencyKey || req.get?.('Idempotency-Key'),
    });
    return res.json({ ok: true, recorded: Boolean(result.recorded) });
  } catch (err) {
    return sendError(res, err);
  }
});
