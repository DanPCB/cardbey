import { describe, expect, it } from 'vitest';
import {
  applyLayoutOrderToMenuDocument,
  formatLayoutHintsForExtraction,
  normalizeMenuLayoutStructure,
  parseMenuLayoutStructureJson,
} from '../menuLayoutStructureAgent.js';

const pinkLotusStyleLayout = {
  layoutPattern: 'multi_column_bands',
  confidence: 0.92,
  regions: [
    {
      id: 'r1',
      role: 'section',
      heading: 'RELAXTION',
      readingOrder: 1,
      band: 0,
      column: 0,
      span: 'half',
      bbox: { x: 0.02, y: 0.05, w: 0.46, h: 0.48 },
      contentHint: 'duration x price rows',
    },
    {
      id: 'r2',
      role: 'section',
      heading: 'DEEP TISSUE FULL BODY',
      readingOrder: 2,
      band: 0,
      column: 1,
      span: 'half',
      bbox: { x: 0.52, y: 0.05, w: 0.46, h: 0.48 },
      contentHint: 'duration x price rows',
    },
    {
      id: 'r3',
      role: 'section',
      heading: 'DOUBLE ( 2x Staff )',
      readingOrder: 3,
      band: 1,
      column: 0,
      span: 'full',
      bbox: { x: 0.02, y: 0.58, w: 0.96, h: 0.38 },
      contentHint: 'duration x price rows',
    },
  ],
  extractionHints: [
    'Left and right columns have different prices — keep as separate services',
    'DOUBLE is a full-width band under the two columns',
  ],
};

describe('menuLayoutStructureAgent', () => {
  it('normalizes multi-column band layout for spa boards', () => {
    const layout = normalizeMenuLayoutStructure(pinkLotusStyleLayout);
    expect(layout).toBeTruthy();
    expect(layout.layoutPattern).toBe('multi_column_bands');
    expect(layout.regions).toHaveLength(3);
    expect(layout.regions[0].heading).toBe('RELAXTION');
    expect(layout.regions[2].span).toBe('full');
    expect(layout.regions[0].bbox.w).toBeCloseTo(0.46);
  });

  it('parses fenced JSON from model output', () => {
    const raw = '```json\n' + JSON.stringify(pinkLotusStyleLayout) + '\n```';
    const layout = parseMenuLayoutStructureJson(raw);
    expect(layout?.regions?.map((r) => r.heading)).toEqual([
      'RELAXTION',
      'DEEP TISSUE FULL BODY',
      'DOUBLE ( 2x Staff )',
    ]);
  });

  it('formats extraction hints that forbid merging separate columns', () => {
    const layout = normalizeMenuLayoutStructure(pinkLotusStyleLayout);
    const block = formatLayoutHintsForExtraction(layout);
    expect(block).toContain('LAYOUT STRUCTURE');
    expect(block).toContain('RELAXTION');
    expect(block).toMatch(/SEPARATE|separate/i);
    expect(block).toContain('DOUBLE');
  });

  it('reorders menu document sections by layout reading order', () => {
    const layout = normalizeMenuLayoutStructure(pinkLotusStyleLayout);
    const doc = {
      version: 1,
      currency: 'AUD',
      sections: [
        { name: 'DOUBLE ( 2x Staff )', offerings: [{ name: 'Double' }] },
        { name: 'DEEP TISSUE FULL BODY', offerings: [{ name: 'Deep Tissue' }] },
        { name: 'RELAXTION', offerings: [{ name: 'Relaxation' }] },
      ],
      stats: { sectionCount: 3, offeringCount: 3 },
    };
    const ordered = applyLayoutOrderToMenuDocument(doc, layout);
    expect(ordered.sections.map((s) => s.name)).toEqual([
      'RELAXTION',
      'DEEP TISSUE FULL BODY',
      'DOUBLE ( 2x Staff )',
    ]);
    expect(ordered.layout).toBeTruthy();
  });
});
