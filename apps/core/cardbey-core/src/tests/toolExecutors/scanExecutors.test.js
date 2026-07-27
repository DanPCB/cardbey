// DANH: skill-round5-tests
import { describe, it, expect, vi } from 'vitest';
import { execute as checkScanCapability } from '../../lib/toolExecutors/scan/check_scan_capability.js';
import { execute as extractCardData } from '../../lib/toolExecutors/scan/extract_card_data.js';
import { execute as createProductFromCard } from '../../lib/toolExecutors/scan/create_product_from_card.js';

vi.mock('../../lib/vision/cardScanPipeline.js', () => ({
  runCardScanPipeline: vi.fn(async () => ({
    ok: true,
    ocrText: 'Acme',
    confidence: 0.9,
    extractedData: { name: 'Acme' },
    preview: { name: 'Acme' },
  })),
}));

vi.mock('../../services/vision/productCreator.js', () => ({
  createFromScan: vi.fn(async () => ({
    ok: true,
    product: { id: 'p1', name: 'Acme' },
    message: 'created',
  })),
}));

describe('scan executors', () => {
  it('check_scan_capability returns availability boolean', async () => {
    const result = await checkScanCapability({ userId: 'u1' });
    expect(result.status).toBe('ok');
    expect(typeof result.output.available).toBe('boolean');
  });

  it('extract_card_data extracts when image buffer provided', async () => {
    const result = await extractCardData({
      imageBuffer: Buffer.from('x'),
      storeId: 's1',
    });
    expect(result.status).toBe('ok');
    expect(result.output?.extracted).toBe(true);
    expect(result.output?.preview?.name).toBe('Acme');
  });

  it('create_product_from_card requires confirmation', async () => {
    const result = await createProductFromCard({
      extracted: true,
      cardData: { name: 'Acme' },
      storeId: 's1',
      userId: 'u1',
    });
    expect(result.status).toBe('ok');
    expect(result.output?.created).toBe(false);
    expect(result.output?.requiresConfirmation).toBe(true);
  });

  it('create_product_from_card creates when confirmed', async () => {
    const result = await createProductFromCard({
      extracted: true,
      cardData: { name: 'Acme' },
      storeId: 's1',
      userId: 'u1',
      confirmed: true,
    });
    expect(result.status).toBe('ok');
    expect(result.output?.created).toBe(true);
    expect(result.output?.product?.id).toBe('p1');
  });
});
