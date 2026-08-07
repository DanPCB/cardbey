import { Features, isMarketplaceListingPilotEnabled } from '../../config/features.js';

export function isContentMarketplaceV1Enabled() {
  return Features.marketplace.contentMarketplaceV1;
}

export function isMarketplaceSellerV1Enabled() {
  return Features.marketplace.contentMarketplaceV1 && Features.marketplace.sellerV1;
}

export function isMarketplaceListingV1Enabled() {
  return isMarketplaceListingPilotEnabled();
}

export function isMarketplaceModerationV1Enabled() {
  return Features.marketplace.contentMarketplaceV1 && Features.marketplace.moderationV1;
}

export function isMarketplacePremiumPurchaseV1Enabled() {
  return (
    Features.marketplace.contentMarketplaceV1 &&
    Features.marketplace.premiumPurchaseV1
  );
}

export function isMarketplaceCreatorEarningsV1Enabled() {
  return (
    Features.marketplace.contentMarketplaceV1 &&
    Features.marketplace.creatorEarningsV1
  );
}

export function assertMarketplaceFlag(enabled, code = 'flag_disabled') {
  if (enabled) return;
  const error = new Error('Marketplace feature is disabled.');
  error.code = code;
  error.statusCode = 403;
  throw error;
}
