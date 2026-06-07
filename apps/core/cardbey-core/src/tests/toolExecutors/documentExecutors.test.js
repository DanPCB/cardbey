// DANH: skill-round6-document
import { describe, it, expect } from 'vitest';
import { execute as createProductsFromDocument } from '../../lib/toolExecutors/document/create_products_from_document.js';
import { execute as createPromotionsFromDocument } from '../../lib/toolExecutors/document/create_promotions_from_document.js';
import { execute as suggestCampaignPlan } from '../../lib/toolExecutors/document/suggest_campaign_plan.js';

describe('document executors', () => {
  it('create_products_from_document skips when not extracted', async () => {
    const result = await createProductsFromDocument({ storeId: 'store-1', extracted: false });
    expect(result.status).toBe('ok');
    expect(result.output.created).toBe(false);
  });

  it('create_products_from_document requires storeId', async () => {
    const result = await createProductsFromDocument({ extracted: true, data: { products: [{ name: 'X' }] } });
    expect(result.status).toBe('failed');
  });

  it('create_promotions_from_document skips without event dates', async () => {
    const result = await createPromotionsFromDocument({
      storeId: 'store-1',
      extracted: true,
      data: { offers: [{ title: 'No date offer' }], events: [] },
    });
    expect(result.status).toBe('ok');
    expect(result.output.created).toBe(false);
  });

  it('suggest_campaign_plan returns empty when no dates', async () => {
    const result = await suggestCampaignPlan({
      extracted: true,
      data: { offers: [{ title: 'Evergreen' }], events: [] },
    });
    expect(result.status).toBe('ok');
    expect(result.output.planReady).toBe(false);
  });
});
