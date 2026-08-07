import { Router } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import {
  assertMarketplaceFlag,
  isContentMarketplaceV1Enabled,
  isMarketplaceListingV1Enabled,
  isMarketplaceSellerV1Enabled,
} from '../lib/marketplace/flags.js';
import {
  applyMarketplaceSeller,
  getMyProfile,
  updateMarketplaceSellerApplication,
} from '../lib/marketplace/seller/sellerService.js';
import {
  archiveMarketplaceListingForCreator,
  createMarketplaceListingDraft,
  getMyMarketplaceListing,
  listMyMarketplaceListings,
  submitMarketplaceListing,
  unpublishMarketplaceListingForCreator,
  updateMarketplaceListingDraft,
} from '../lib/marketplace/listing/listingService.js';
import { listPublicMarketplaceLibraryAssets } from '../lib/marketplace/projection/libraryProjectionService.js';

const router = Router();

function sendMarketplaceError(res, error) {
  const statusCode = Number(error?.statusCode) || 500;
  return res.status(statusCode).json({
    ok: false,
    error: error?.code || 'marketplace_error',
    message: error?.message || 'Marketplace request failed.',
    details: error?.details ?? null,
  });
}

router.get('/marketplace/seller/me', requireAuth, async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceSellerV1Enabled());
    const seller = await getMyProfile(req.userId);
    return res.json({ ok: true, seller });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/seller/apply', requireAuth, async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceSellerV1Enabled());
    const seller = await applyMarketplaceSeller(req.userId, req.body || {});
    return res.status(201).json({ ok: true, seller });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.patch('/marketplace/seller/application', requireAuth, async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceSellerV1Enabled());
    const seller = await updateMarketplaceSellerApplication(req.userId, req.body || {});
    return res.json({ ok: true, seller });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.get('/marketplace/listings', requireAuth, async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceListingV1Enabled());
    const items = await listMyMarketplaceListings(req.userId);
    return res.json({ ok: true, items });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/listings', requireAuth, async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceListingV1Enabled());
    const listing = await createMarketplaceListingDraft(req.userId, req.body || {});
    return res.status(201).json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.get('/marketplace/listings/:listingId', requireAuth, async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceListingV1Enabled());
    const listing = await getMyMarketplaceListing(req.userId, String(req.params.listingId || ''));
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.patch('/marketplace/listings/:listingId', requireAuth, async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceListingV1Enabled());
    const listing = await updateMarketplaceListingDraft(
      req.userId,
      String(req.params.listingId || ''),
      req.body || {},
    );
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/listings/:listingId/submit', requireAuth, async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceListingV1Enabled());
    const listing = await submitMarketplaceListing(req.userId, String(req.params.listingId || ''));
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/listings/:listingId/unpublish', requireAuth, async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceListingV1Enabled());
    const listing = await unpublishMarketplaceListingForCreator(
      req.userId,
      String(req.params.listingId || ''),
    );
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.post('/marketplace/listings/:listingId/archive', requireAuth, async (req, res) => {
  try {
    assertMarketplaceFlag(isMarketplaceListingV1Enabled());
    const listing = await archiveMarketplaceListingForCreator(
      req.userId,
      String(req.params.listingId || ''),
    );
    return res.json({ ok: true, listing });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

router.get('/marketplace/library', optionalAuth, async (req, res) => {
  try {
    assertMarketplaceFlag(isContentMarketplaceV1Enabled());
    const items = await listPublicMarketplaceLibraryAssets({
      limit: req.query.limit,
    });
    return res.json({ ok: true, items });
  } catch (error) {
    return sendMarketplaceError(res, error);
  }
});

export default router;
