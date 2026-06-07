// DANH: skill-round6-document
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import '../../lib/skills/definitions/DocumentIngestionSkill.js';
import { DocumentIngestionSkill } from '../../lib/skills/definitions/DocumentIngestionSkill.js';
import { ProductCatalogSkill } from '../../lib/skills/definitions/ProductCatalogSkill.js';
import { execute as extractDocumentData } from '../../lib/toolExecutors/document/extract_document_data.js';
import { execute as suggestCampaignPlan } from '../../lib/toolExecutors/document/suggest_campaign_plan.js';
import { parseDocumentExtractionJson } from '../../services/documentExtraction/documentVisionExtract.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'document_ingestion';
}

describe('DocumentIngestionSkill', () => {
  it('matches primary trigger scan_document', () => {
    expect(matchesTrigger('scan_document')).toBe(true);
  });

  it('matches upload_flyer and import_document', () => {
    expect(matchesTrigger('upload_flyer')).toBe(true);
    expect(matchesTrigger('import_document')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('create_video')).toBe(false);
  });

  it('triggers do not overlap ProductCatalogSkill triggers', () => {
    const doc = new Set(DocumentIngestionSkill.triggers);
    const overlap = (ProductCatalogSkill.triggers ?? []).filter((t) => doc.has(t));
    expect(overlap).toEqual([]);
  });

  it('step list is ordered for full ingestion pipeline', () => {
    expect(DocumentIngestionSkill.steps.map((s) => s.tool)).toEqual([
      'extract_document_data',
      'create_products_from_document',
      'create_promotions_from_document',
      'suggest_campaign_plan',
    ]);
  });

  it('extract_document_data returns honest empty when no image', async () => {
    const result = await extractDocumentData({});
    expect(result.status).toBe('ok');
    expect(result.output.extracted).toBe(false);
  });

  it('parseDocumentExtractionJson handles fenced JSON', () => {
    const data = parseDocumentExtractionJson('```json\n{"products":[{"name":"Tour A"}]}\n```');
    expect(Array.isArray(data.products)).toBe(true);
    expect(data.products[0].name).toBe('Tour A');
  });

  it('suggest_campaign_plan builds calendar from event dates', async () => {
    const result = await suggestCampaignPlan({
      extracted: true,
      data: {
        events: [{ name: 'Spring Sale', date: '2026-12-01', venue: 'Main St' }],
        offers: [],
      },
    });
    expect(result.status).toBe('ok');
    expect(result.output.planReady).toBe(true);
    expect(result.output.calendar.length).toBeGreaterThan(0);
    expect(result.output.calendar[0]).toMatchObject({
      week: expect.any(String),
      action: expect.any(String),
      content: expect.any(String),
      channel: expect.any(String),
    });
  });
});
