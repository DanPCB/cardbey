import { MARKETPLACE_SELLER_STATUS } from '../types.js';

function pushReason(reasons, code, message) {
  reasons.push({ code, message });
}

export function evaluateMarketplaceListingEligibility(input = {}) {
  const reasons = [];
  const sellerStatus = String(input.sellerStatus || '').trim().toUpperCase();
  const content = input.content || null;
  const creatorId = input.creatorId ? String(input.creatorId) : null;

  if (sellerStatus !== MARKETPLACE_SELLER_STATUS.APPROVED) {
    pushReason(reasons, 'seller_not_approved', 'Marketplace seller must be approved.');
  }

  if (!content) {
    pushReason(reasons, 'content_not_found', 'Source creator content was not found.');
    return { eligible: false, reasons };
  }

  if (creatorId && String(content.creatorId || '') !== creatorId) {
    pushReason(reasons, 'content_not_owned', 'Source creator content does not belong to this creator.');
  }

  const contentType = String(content.type || '').trim().toUpperCase();
  if (contentType === 'ARTICLE') {
    pushReason(reasons, 'content_type_not_supported', 'ARTICLE listings are not supported in Phase 1C.');
  } else if (contentType === 'LIVESTREAM') {
    pushReason(reasons, 'content_type_not_supported', 'LIVESTREAM listings are not supported in Phase 1C.');
  } else if (contentType !== 'VIDEO') {
    pushReason(reasons, 'content_type_not_supported', 'Only VIDEO listings are eligible in Phase 1C.');
  }

  if (String(content.status || '').trim().toLowerCase() !== 'published') {
    pushReason(reasons, 'source_not_published', 'Source creator content must already be published.');
  }

  if (!String(content.thumbnail || '').trim()) {
    pushReason(reasons, 'thumbnail_required', 'Source creator content must include a thumbnail.');
  }

  if (!String(content.mediaUrl || '').trim()) {
    pushReason(reasons, 'media_required', 'Source creator content must include a media URL.');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}
