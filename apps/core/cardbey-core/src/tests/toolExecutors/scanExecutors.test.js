// DANH: skill-round5-tests
import { describe, it, expect } from 'vitest';
import { execute as checkScanCapability } from '../../lib/toolExecutors/scan/check_scan_capability.js';
import { execute as extractCardData } from '../../lib/toolExecutors/scan/extract_card_data.js';
import { execute as createProductFromCard } from '../../lib/toolExecutors/scan/create_product_from_card.js';

describe('scan executors', () => {
  it('check_scan_capability returns ok output', async () => {
    const result = await checkScanCapability({ userId: 'u1' });
    expect(result.status).toBe('ok');
    expect(typeof result.output.available).toBe('boolean');
  });

  it('extract_card_data returns honest stub when bridge unavailable', async () => {
    const result = await extractCardData({ available: false });
    expect(result.status).toBe('ok');
    expect(result.output?.extracted).toBe(false);
    expect(result.output?.reason).toMatch(/bridge/i);
  });

  it('create_product_from_card does not throw on empty input', async () => {
    const result = await createProductFromCard({});
    expect(result.status).toBe('ok');
    expect(result.output?.created).toBe(false);
  });

  it('create_product_from_card requires extracted true for creation path', async () => {
    const result = await createProductFromCard({ extracted: true, cardData: { name: 'Acme' } });
    expect(result.status).toBe('ok');
    expect(result.output?.created).toBe(false);
    expect(result.output?.reason).toMatch(/not implemented/i);
  });
});
