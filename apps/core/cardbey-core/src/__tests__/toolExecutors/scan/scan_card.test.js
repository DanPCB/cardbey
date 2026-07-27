import { describe, it, expect, vi } from 'vitest';
import { execute as scanCard } from '../../../lib/toolExecutors/scan/scan_card.js';
import { EXECUTION_STATES } from '../../../lib/telemetry/executionStates.js';

vi.mock('../../../lib/vision/cardScanPipeline.js', () => ({
  runCardScanPipeline: vi.fn(async () => ({
    ok: true,
    ocrText: 'Acme Corp',
    confidence: 0.92,
    extractedData: { name: 'Acme Corp' },
    preview: { name: 'Acme Corp' },
  })),
}));

vi.mock('../../../services/vision/productCreator.js', () => ({
  createFromScan: vi.fn(async () => ({
    ok: true,
    product: { id: 'p1', name: 'Acme Corp' },
    message: 'created',
  })),
}));

describe('scan_card unified executor', () => {
  it('scans and returns preview when not confirmed', async () => {
    const result = await scanCard({
      storeId: 'test-store',
      imageBuffer: Buffer.from('fake-image'),
    });

    expect(result.status).toBe('ok');
    expect(result.output?.executionState).toBe(EXECUTION_STATES.EXECUTED);
    expect(result.output?.requiresConfirmation).toBe(true);
    expect(result.output?.preview?.name).toBe('Acme Corp');
  });

  it('creates product when confirmed', async () => {
    const result = await scanCard({
      storeId: 'test-store',
      imageBuffer: Buffer.from('fake-image'),
      confirmed: true,
      userId: 'u1',
    });

    expect(result.status).toBe('ok');
    expect(result.output?.created).toBe(true);
    expect(result.output?.product?.id).toBe('p1');
  });

  it('blocks without storeId', async () => {
    const result = await scanCard({ imageBuffer: Buffer.from('x') });
    expect(result.status).toBe('blocked');
    expect(result.blocker?.code).toBe('STORE_ID_REQUIRED');
  });

  it('blocks without image', async () => {
    const result = await scanCard({ storeId: 'test-store' });
    expect(result.status).toBe('blocked');
    expect(result.blocker?.code).toBe('IMAGE_REQUIRED');
  });
});
