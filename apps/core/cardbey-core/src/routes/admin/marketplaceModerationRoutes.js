import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { assertMarketplaceFlag, isMarketplaceModerationV1Enabled } from '../../lib/marketplace/flags.js';
import {
  listMarketplaceSellerQueue,
  reviewMarketplaceSeller,
} from '../../lib/marketplace/seller/sellerService.js';
import {
  approveMarketplaceListing,
  getMarketplaceListingDetail,
  listMarketplaceListingQueue,
  publishMarketplaceListing,
  rejectMarketplaceListing,
  requestMarketplaceListingChanges,
  restoreMarketplaceListing,
  suspendMarketplaceListing,
  unpublishMarketplaceListingForAdmin,
} from '../../lib/marketplace/listing/listingService.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

function sendMarketplaceError(res, error) {
  const statusCode = Number(error?.statusCode) || 500;
  return res.status(statusCode).json({
    ok: false,
    error: error?.code || 'marketplace_error',
    message: error?.message || 'Marketplace moderation request failed.',
    details: error?.details ?? null,
  });
}

function moderationContext(req) {
  return {
    actorUserId: req.userId ?? req.user?.id ?? null,
    actorRole: req.user?.role ?? 'admin',
  };
}

router.get('/marketplace/sellers/queue', async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceModerationV1Enabled());
    const items = await listMarketplaceSellerQueue({ limit: req.query.limit });
    return res.json({ ok: true, items });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/sellers/:sellerId/review', async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceModerationV1Enabled());
    const seller = await reviewMarketplaceSeller(
      String(req.params.sellerId || ''),
      req.body || {},
      moderationContext(req),
    );
    return res.json({ ok: true, seller });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.get('/marketplace/listings/queue', async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceModerationV1Enabled());
    const items = await listMarketplaceListingQueue({
      limit: req.query.limit,
      status: req.query.status,
    });
    return res.json({ ok: true, items });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.get('/marketplace/listings/:listingId', async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceModerationV1Enabled());
    const detail = await getMarketplaceListingDetail(String(req.params.listingId || ''));
    return res.json({ ok: true, ...detail });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/listings/:listingId/approve', async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceModerationV1Enabled());
    const listing = await approveMarketplaceListing(
      String(req.params.listingId || ''),
      req.body || {},
      moderationContext(req),
    );
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/listings/:listingId/request-changes', async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceModerationV1Enabled());
    const listing = await requestMarketplaceListingChanges(
      String(req.params.listingId || ''),
      req.body || {},
      moderationContext(req),
    );
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/listings/:listingId/reject', async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceModerationV1Enabled());
    const listing = await rejectMarketplaceListing(
      String(req.params.listingId || ''),
      req.body || {},
      moderationContext(req),
    );
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/listings/:listingId/publish', async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceModerationV1Enabled());
    const listing = await publishMarketplaceListing(
      String(req.params.listingId || ''),
      moderationContext(req),
    );
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/listings/:listingId/suspend', async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceModerationV1Enabled());
    const listing = await suspendMarketplaceListing(
      String(req.params.listingId || ''),
      req.body || {},
      moderationContext(req),
    );
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/listings/:listingId/restore', async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceModerationV1Enabled());
    const listing = await restoreMarketplaceListing(
      String(req.params.listingId || ''),
      moderationContext(req),
    );
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/listings/:listingId/unpublish', async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceModerationV1Enabled());
    const listing = await unpublishMarketplaceListingForAdmin(
      String(req.params.listingId || ''),
      moderationContext(req),
    );
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

export default router;
