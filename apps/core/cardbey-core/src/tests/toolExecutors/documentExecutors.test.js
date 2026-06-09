// DANH: skill-round6-document
import { describe, it, expect } from 'vitest';
import { execute as createProductsFromDocument } from '../../lib/toolExecutors/document/create_products_from_document.js';
import { execute as createPromotionsFromDocument } from '../../lib/toolExecutors/document/create_promotions_from_document.js';
import { parseDocumentDeadline } from '../../services/documentExtraction/parseDocumentDeadline.js';
import { execute as suggestCampaignPlan } from '../../lib/toolExecutors/document/suggest_campaign_plan.js';

describe('document executors', () => {
  it('create_products_from_document skips when not extracted', async () => {
    const result = await createProductsFromDocument({ storeId: 'store-1', extracted: false });
    expect(result.status).toBe('ok');
    expect(result.output.created).toEqual([]);
  });

  it('create_products_from_document requires storeId', async () => {
    const result = await createProductsFromDocument({ extracted: true, data: { products: [{ name: 'X' }] } });
    expect(result.status).toBe('failed');
  });

  it('create_promotions_from_document skips without event dates', async () => {
    const result = await createPromotionsFromDocument({
      storeId: 'store-1',
      extracted: true,
      data: { offers: [{ title: 'No date offer' }], events: [], campaigns: [] },
    });
    expect(result.status).toBe('ok');
    expect(result.output.created).toEqual([]);
  });

  it('suggest_campaign_plan returns empty when no dates', async () => {
    const result = await suggestCampaignPlan({
      extracted: true,
      data: { offers: [{ title: 'Evergreen' }], events: [] },
    });
    expect(result.status).toBe('ok');
    expect(result.output.planReady).toBe(false);
  });

  it('parseDocumentDeadline handles month ranges and ISO dates', () => {
    const iso = parseDocumentDeadline('2026-08-01');
    expect(iso?.getFullYear()).toBe(2026);

    const monthRange = parseDocumentDeadline('July/August 2026');
    expect(monthRange?.getMonth()).toBe(7); // August

    const span = parseDocumentDeadline('Aug 11-15, 2026');
    expect(span?.getFullYear()).toBe(2026);
  });

  it('create_promotions_from_document skips campaign promos when products failed to link', async () => {
    const result = await createPromotionsFromDocument({
      storeId: 'store-1',
      extracted: true,
      productsExpected: 2,
      productIds: [],
      data: {
        products: [{ name: 'Tour A' }, { name: 'Tour B' }],
        campaigns: [{ name: 'Summer Sale', copy: 'Save 20%', channel: 'email' }],
        offers: [],
        events: [],
      },
    });
    expect(result.status).toBe('ok');
    expect(result.output.created).toEqual([]);
    expect(result.output.blockCampaignPromos).toBe(true);
    expect(result.output.skipped?.[0]?.reason).toBe('no_linked_products');
  });

  it('buildCampaignPlanRecord maps target, timeWindow, and channelsRequested', async () => {
    const { buildCampaignPlanRecord } = await import(
      '../../lib/toolExecutors/document/suggest_campaign_plan.js'
    );
    const calendar = [{ week: 'Week -2', action: 'Teaser', content: 'Save the date', channel: 'social' }];
    const end = new Date('2026-08-01');
    const record = buildCampaignPlanRecord({
      tenantKey: 'tenant-1',
      storeId: 'store-1',
      missionId: 'mission-abc',
      data: {
        business: { name: 'AA Travel' },
        campaign: { name: 'Summer Escape', channel: 'social' },
      },
      businessName: 'AA Travel',
      productIds: ['prod-1', 'prod-2'],
      calendar,
      earliestEnd: end,
    });
    expect(record.objective).toBe('Summer Escape — DocumentIngestionSkill');
    expect(record.missionId).toBe('mission-abc');
    expect(record.target).toMatchObject({
      products: ['prod-1', 'prod-2'],
      business: 'AA Travel',
      source: 'document_ingestion',
    });
    expect(record.timeWindow.end).toBe(end.toISOString());
    expect(record.timeWindow.tz).toBe('Australia/Melbourne');
    expect(record.channelsRequested).toEqual(calendar);
  });
});
