/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  isAddProductCatalogIntent,
  isVagueAddProductMessage,
  shouldClarifyGuestDraftAddProduct,
} from '../guestDraftProductClarify.js';

describe('guestDraftProductClarify', () => {
  const guestReq = { isGuest: true, user: null };
  const draftCtx = { draftId: 'draft-1', runway: null };

  it('detects add product intents', () => {
    expect(isAddProductCatalogIntent('Add a product')).toBe(true);
    expect(isAddProductCatalogIntent('import my menu')).toBe(true);
    expect(isAddProductCatalogIntent('create store')).toBe(false);
  });

  it('treats short add-product messages as vague', () => {
    expect(isVagueAddProductMessage('Add a product')).toBe(true);
    expect(isVagueAddProductMessage('Add a product', { hasAttachment: true })).toBe(false);
    expect(
      isVagueAddProductMessage('Add Latte $5.50 large size with oat milk option for morning menu'),
    ).toBe(false);
  });

  it('clarifies for guest with draft and vague add product', () => {
    expect(
      shouldClarifyGuestDraftAddProduct({
        req: guestReq,
        effectiveStoreId: null,
        ...draftCtx,
        userMessage: 'Add a product',
        hasAttachment: false,
        tool: 'replace_store_catalog',
      }),
    ).toBe(true);
  });

  it('clarifies for guest with temp store id when message is vague', () => {
    expect(
      shouldClarifyGuestDraftAddProduct({
        req: guestReq,
        effectiveStoreId: 'store-guest-1',
        missionId: 'mission-1',
        userMessage: 'Add a product',
        tool: 'replace_store_catalog',
      }),
    ).toBe(true);
  });

  it('does not clarify when message targets my store explicitly', () => {
    expect(
      shouldClarifyGuestDraftAddProduct({
        req: guestReq,
        effectiveStoreId: 'store-guest-1',
        missionId: 'mission-1',
        userMessage: 'Add a product to my store',
        tool: 'replace_store_catalog',
      }),
    ).toBe(false);
  });

  it('still clarifies vague add product for guest with store id (sign-in comes after)', () => {
    expect(
      shouldClarifyGuestDraftAddProduct({
        req: guestReq,
        effectiveStoreId: 'store-1',
        ...draftCtx,
        userMessage: 'Add a product',
      }),
    ).toBe(true);
  });

  it('does not clarify detailed product messages', () => {
    expect(
      shouldClarifyGuestDraftAddProduct({
        req: guestReq,
        effectiveStoreId: null,
        ...draftCtx,
        userMessage: 'Add Cappuccino $4.50 with description: rich espresso and steamed milk',
        tool: 'replace_store_catalog',
      }),
    ).toBe(false);
  });
});
