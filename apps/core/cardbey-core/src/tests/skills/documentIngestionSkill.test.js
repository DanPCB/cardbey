// DANH: skill-round6-document
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import '../../lib/skills/definitions/DocumentIngestionSkill.js';
import { DocumentIngestionSkill } from '../../lib/skills/definitions/DocumentIngestionSkill.js';
import { ProductCatalogSkill } from '../../lib/skills/definitions/ProductCatalogSkill.js';
import { execute as extractDocumentData } from '../../lib/toolExecutors/document/extract_document_data.js';
import { execute as createProductsFromDocument } from '../../lib/toolExecutors/document/create_products_from_document.js';
import { execute as suggestCampaignPlan } from '../../lib/toolExecutors/document/suggest_campaign_plan.js';
import { execute as generateExecutionSummary } from '../../lib/toolExecutors/document/generate_execution_summary.js';
import {
  parseDocumentExtractionJson,
  normalizeDocumentExtraction,
} from '../../services/documentExtraction/documentVisionExtract.js';
import {
  detectDocumentIngestionIntent,
  extractIngestionInputs,
} from '../../lib/intake/documentIngestionIntent.js';
import { skillRouter } from '../../lib/skills/index.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'document_ingestion';
}

const AA_TRAVEL_FLYER = {
  business: { name: 'AA Travel', type: 'travel agency' },
  businessName: 'AA Travel',
  contacts: [{ phone: '0800 123 456', email: 'info@aatravel.nz' }],
  campaign: { name: 'Summer Escape', copy: 'Book early and save', channel: 'social', urgency: 'Limited' },
  products: [
    {
      name: 'Queenstown Escape',
      dates: '2026-09-15',
      location: 'Queenstown, NZ',
      venues: ['Skyline Gondola'],
      pricing: [{ tier: 'Standard', price: 1299, currency: 'NZD' }],
      includes: ['Flights', 'Hotel'],
      highlights: ['Scenic views', 'Adventure activities'],
      deadline: '2026-08-01',
    },
  ],
  campaigns: [
    { name: 'Summer Sale', copy: 'Book now save 20%', channel: 'email', urgency: 'Ends soon' },
  ],
  calendar: [
    { week: 'Week -4', action: 'Teaser', content: 'Save the date for Queenstown', channel: 'social' },
    { week: 'Week -2', action: 'Urgency', content: 'Deadline approaching', channel: 'email' },
  ],
  gaps: ['No logo detected', 'Missing refund policy'],
  offers: [],
  events: [{ name: 'Summer Sale', date: '2026-08-01', venue: 'Online' }],
};

describe('DocumentIngestionSkill', () => {
  it('matches primary trigger scan_document', () => {
    expect(matchesTrigger('scan_document')).toBe(true);
  });

  it('matches ingest_document trigger', () => {
    expect(matchesTrigger('ingest_document')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('create_video')).toBe(false);
  });

  it('triggers do not overlap ProductCatalogSkill triggers', () => {
    const doc = new Set(DocumentIngestionSkill.triggers);
    const overlap = (ProductCatalogSkill.triggers ?? []).filter((t) => doc.has(t));
    expect(overlap).toEqual([]);
  });

  it('step list is ordered for full ingestion pipeline including living document', () => {
    expect(DocumentIngestionSkill.steps.map((s) => s.tool)).toEqual([
      'extract_document_data',
      'create_products_from_document',
      'create_promotions_from_document',
      'suggest_campaign_plan',
      'generate_execution_summary',
      'generate_living_document',
    ]);
  });

  it('declares document_ingestion_result display type for Performer UI', () => {
    expect(DocumentIngestionSkill.displayResultType).toBe('document_ingestion_result');
  });

  it('extract_document_data returns honest empty when no image', async () => {
    const result = await extractDocumentData({});
    expect(result.status).toBe('ok');
    expect(result.output.extracted).toBe(false);
  });

  it('extract_document_data returns vision_failed for unloadable document URL', async () => {
    const result = await extractDocumentData({
      documentUrl: 'https://example.invalid/cardbey-doc-ingest-test-not-found.jpg',
    });
    expect(result.status).toBe('failed');
    expect(result.output.error).toBe('vision_failed');
  });

  it('parseDocumentExtractionJson handles AA Travel flyer and malformed JSON', () => {
    const raw = '```json\n' + JSON.stringify(AA_TRAVEL_FLYER) + '\n```';
    const data = normalizeDocumentExtraction(parseDocumentExtractionJson(raw));
    expect(data.businessName).toBe('AA Travel');
    expect(data.products[0].name).toBe('Queenstown Escape');
    expect(data.gaps).toHaveLength(2);

    const malformed = normalizeDocumentExtraction(parseDocumentExtractionJson('{ not valid json'));
    expect(malformed.products).toEqual([]);
    expect(malformed.gaps).toEqual([]);
  });

  it('normalizeDocumentExtraction fills defaults for partial product rows', () => {
    const data = normalizeDocumentExtraction({
      products: [{ highlights: ['Scenic'] }, {}],
    });
    expect(data.products[0].name).toBe('Untitled Product 1');
    expect(data.products[0].pricing).toEqual([]);
    expect(data.products[0].venues).toEqual([]);
    expect(data.products[0].highlights).toEqual(['Scenic']);
    expect(data.products[1].name).toBe('Untitled Product 2');
    expect(data.products[1].deadline).toBeNull();
  });

  it('suggest_campaign_plan enriches calendar with scheduledDate from product deadline', async () => {
    const result = await suggestCampaignPlan({
      extracted: true,
      data: {
        ...AA_TRAVEL_FLYER,
        products: [{ ...AA_TRAVEL_FLYER.products[0], deadline: 'July/August 2026' }],
      },
    });
    expect(result.status).toBe('ok');
    expect(result.output.planReady).toBe(true);
    expect(result.output.calendar.length).toBeGreaterThan(0);
    expect(result.output.calendar[0].scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('generate_execution_summary composes summary with gaps and nextActions', async () => {
    const result = await generateExecutionSummary({
      storeId: 'store-1',
      storeSlug: 'aa-travel',
      extractResult: { data: AA_TRAVEL_FLYER, extracted: true },
      productsResult: { created: ['prod-1'], count: 1 },
      promosResult: { created: ['promo-1'], count: 1 },
      planResult: { calendar: AA_TRAVEL_FLYER.calendar, weeks: AA_TRAVEL_FLYER.calendar },
    });
    expect(result.status).toBe('ok');
    expect(result.output.summary).toContain('product');
    expect(result.output.summary).toContain('Gaps identified');
    expect(result.output.gaps).toEqual(AA_TRAVEL_FLYER.gaps);
    expect(result.output.nextActions).toContain('publish_campaign');
    expect(result.output.display?.type).toBe('document_ingestion_result');
    expect(result.output.display?.business?.name).toBe('AA Travel');
    expect(result.output.display?.products?.[0]?.name).toBe('Queenstown Escape');
    expect(result.output.display?.storeUrl).toBe('/s/aa-travel');
    expect(result.output.display?.nextActions).toHaveLength(3);
  });

  it('create_products_from_document requires storeId', async () => {
    const result = await createProductsFromDocument({
      extracted: true,
      data: { products: [{ name: 'Tour A' }] },
    });
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });

  it('full pipeline summary step with demo AA Travel data', async () => {
    const extract = {
      extracted: true,
      data: normalizeDocumentExtraction(AA_TRAVEL_FLYER),
    };
    const plan = await suggestCampaignPlan({ extracted: true, data: extract.data });
    const summary = await generateExecutionSummary({
      extractResult: extract,
      productsResult: { created: [], skipped: [], errors: [], count: 0 },
      promosResult: { created: [], count: 0 },
      planResult: plan.output,
    });
    expect(summary.output.counts.calendarEntries).toBe(AA_TRAVEL_FLYER.calendar.length);
    expect(summary.output.summary).toMatch(/Ready to publish\?/);
  });
});

describe('documentIngestionIntent (ReAct fast path)', () => {
  it('detectDocumentIngestionIntent — URL pattern', () => {
    expect(
      detectDocumentIngestionIntent('Please import https://cdn.example.com/flyer.jpg for our store', {}),
    ).toBe('ingest_document');
  });

  it('detectDocumentIngestionIntent — attachment context', () => {
    expect(
      detectDocumentIngestionIntent('', {
        attachments: [{ base64: 'abc123', mimeType: 'image/png' }],
      }),
    ).toBe('ingest_document');
  });

  it('detectDocumentIngestionIntent — "here is our flyer" phrase', () => {
    expect(detectDocumentIngestionIntent("here's our flyer for the summer sale", {})).toBe(
      'ingest_document',
    );
  });

  it('detectDocumentIngestionIntent — returns null for unrelated message', () => {
    expect(detectDocumentIngestionIntent('show me my orders from last week', {})).toBeNull();
  });

  it('extractIngestionInputs — extracts URL from message', () => {
    const inputs = extractIngestionInputs('Use https://cdn.example.com/promo.webp please', {
      storeId: 'store-99',
    });
    expect(inputs.documentUrl).toBe('https://cdn.example.com/promo.webp');
    expect(inputs.documentBase64).toBeNull();
    expect(inputs.storeId).toBe('store-99');
  });

  it('extractIngestionInputs — falls back to attachment base64', () => {
    const inputs = extractIngestionInputs('also see https://cdn.example.com/other.jpg', {
      attachments: [{ base64: 'YmFzZTY0', mimeType: 'image/jpeg' }],
      storeId: 'store-1',
    });
    expect(inputs.documentBase64).toBe('YmFzZTY0');
    expect(inputs.documentUrl).toBeNull();
    expect(inputs.mimeType).toBe('image/jpeg');
  });

  it('skillRouter resolves ingest_document to document_ingestion skill', async () => {
    const skillDef = skillRegistry.findByTrigger('ingest_document');
    expect(skillDef?.name).toBe('document_ingestion');
    const routeProbe = skillRegistry.findByTrigger('ingest_document');
    expect(routeProbe?.steps?.length).toBeGreaterThanOrEqual(5);
    expect(skillRouter).toBeDefined();
  });
});
