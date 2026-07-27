import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../prisma.js', () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock('../documentIngestionFromVision.js', () => ({
  dispatchDocumentIngestionFromVision: vi.fn(),
}));

import { getPrismaClient } from '../../prisma.js';
import { dispatchDocumentIngestionFromVision } from '../documentIngestionFromVision.js';
import { routeVisionEvent } from '../visionRouter.js';

function baseEvent(overrides = {}) {
  return {
    id: 'evt-1',
    captureMode: 'photo',
    surface: 'feed',
    userId: 'user-1',
    storeIdHint: null,
    decodedPayload: null,
    imagePaths: ['/uploads/media/vision-intake-test.jpg'],
    location: null,
    intent: 'unknown',
    intentConfidence: 0,
    extraction: {},
    ...overrides,
  };
}

describe('visionRouter', () => {
  beforeEach(() => {
    vi.mocked(getPrismaClient).mockReset();
    vi.mocked(dispatchDocumentIngestionFromVision).mockReset();
  });

  it('routes qr_payload via deep link resolver', async () => {
    const route = await routeVisionEvent(
      baseEvent({
        intent: 'qr_payload',
        decodedPayload: 'https://www.cardbey.com/s/demo-cafe',
      }),
    );
    expect(route).toEqual({ action: 'open_store', slug: 'demo-cafe' });
  });

  it('routes flyer_menu to document ingestion when store context exists', async () => {
    vi.mocked(dispatchDocumentIngestionFromVision).mockResolvedValue({
      action: 'document_ingestion_complete',
      storeId: 'store-1',
      results: {},
    });

    const route = await routeVisionEvent(
      baseEvent({ intent: 'flyer_menu' }),
      { storeIdHint: 'store-1', userId: 'user-1' },
    );

    expect(dispatchDocumentIngestionFromVision).toHaveBeenCalledWith({
      storeId: 'store-1',
      userId: 'user-1',
      missionId: null,
      imagePaths: ['/uploads/media/vision-intake-test.jpg'],
    });
    expect(route.action).toBe('document_ingestion_complete');
  });

  it('routes flyer_menu without storeId to open_store when business matches publicly', async () => {
    vi.mocked(getPrismaClient).mockReturnValue({
      business: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'store-42', name: 'AA Travel', slug: 'aa-travel', lat: null, lng: null },
        ]),
      },
    });

    const route = await routeVisionEvent(
      baseEvent({
        intent: 'flyer_menu',
        extraction: { businessName: 'AA Travel', products: [{ name: 'Queenstown Escape' }] },
      }),
    );

    expect(dispatchDocumentIngestionFromVision).not.toHaveBeenCalled();
    expect(route).toMatchObject({
      action: 'open_store',
      storeId: 'store-42',
      slug: 'aa-travel',
      matchedFrom: 'flyer_menu',
    });
  });

  it('routes flyer_menu without storeId to ghost_store_candidate when business is unknown', async () => {
    vi.mocked(getPrismaClient).mockReturnValue({
      business: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    });

    const extraction = {
      businessName: 'Mystery Tours',
      category: 'travel',
      products: [{ name: 'Bay Cruise', price: 49 }],
    };
    const route = await routeVisionEvent(
      baseEvent({
        intent: 'flyer_menu',
        extraction,
      }),
    );

    expect(dispatchDocumentIngestionFromVision).not.toHaveBeenCalled();
    expect(route).toEqual({
      action: 'ghost_store_candidate',
      intent: 'flyer_menu',
      extraction,
      location: null,
    });
  });

  it('routes store_sign to open_store when business matches', async () => {
    vi.mocked(getPrismaClient).mockReturnValue({
      business: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'store-99', name: 'Cafe Luna', slug: 'cafe-luna', lat: null, lng: null },
        ]),
      },
    });

    const route = await routeVisionEvent(
      baseEvent({
        intent: 'store_sign',
        extraction: { businessName: 'Cafe Luna' },
      }),
    );

    expect(route).toMatchObject({
      action: 'open_store',
      storeId: 'store-99',
      slug: 'cafe-luna',
    });
  });

  it('routes store_sign to ghost_store_candidate when no match', async () => {
    vi.mocked(getPrismaClient).mockReturnValue({
      business: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    });

    const route = await routeVisionEvent(
      baseEvent({
        intent: 'store_sign',
        extraction: { businessName: 'New Cafe', category: 'cafe' },
      }),
    );

    expect(route.action).toBe('ghost_store_candidate');
    expect(route.extraction.businessName).toBe('New Cafe');
  });

  it('routes product_photo to product_capture_candidate with store hint', async () => {
    const route = await routeVisionEvent(
      baseEvent({
        intent: 'product_photo',
        extraction: { products: [{ name: 'Latte' }] },
      }),
      { storeIdHint: 'store-55' },
    );
    expect(route).toEqual({
      action: 'product_capture_candidate',
      storeId: 'store-55',
      extraction: { products: [{ name: 'Latte' }] },
    });
  });

  it('routes product_photo to needs_store_context without store hint', async () => {
    const route = await routeVisionEvent(baseEvent({ intent: 'product_photo' }));
    expect(route.action).toBe('needs_store_context');
  });

  it('routes receipt and unknown to unsupported', async () => {
    const receipt = await routeVisionEvent(baseEvent({ intent: 'receipt' }));
    expect(receipt.action).toBe('unsupported');
    expect(receipt.intent).toBe('receipt');

    const unknown = await routeVisionEvent(baseEvent({ intent: 'unknown' }));
    expect(unknown.action).toBe('unsupported');
  });
});
