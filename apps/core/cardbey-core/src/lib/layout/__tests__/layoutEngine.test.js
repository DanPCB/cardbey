import { describe, it, expect } from 'vitest';
import { LayoutEngine, LAYOUT_TYPES } from '../layoutEngine.js';

describe('LayoutEngine', () => {
  const engine = new LayoutEngine();

  it('exposes all layout types', () => {
    expect(LAYOUT_TYPES).toEqual(['text', 'menu', 'graphic', 'dashboard', 'document', 'storefront']);
  });

  it('detects and formats text reports', async () => {
    const content = `Cardbey Audit\n\nExecutive Summary\nFindings here.`;
    expect(engine.detectType(content)).toBe('text');

    const result = await engine.applyLayout(content);
    expect(result.type).toBe('text');
    expect(result.processed).toContain('# Cardbey Audit');
    expect(result.processed).toContain('## Executive Summary');
  });

  it('detects and formats menu content', async () => {
    const content = `COFFEE\nEspresso 3.50\nLatte 4.50\nRich and creamy\n\nDESSERTS\nCheesecake 6.00`;

    expect(engine.detectType(content)).toBe('menu');
    const result = await engine.applyLayout(content);
    expect(result.processed).toContain('# MENU');
    expect(result.processed).toContain('## COFFEE');
    expect(result.processed).toContain('**$3.50**');
    expect(result.stats.items).toBeGreaterThan(0);
  });

  it('detects and formats graphic/design content', async () => {
    const content = `Design layout with flexbox grid\nPrimary color #336699\nSpacing 16px and 24px padding`;

    expect(engine.detectType(content)).toBe('graphic');
    const result = await engine.applyLayout(content);
    expect(result.processed).toContain('.container');
    expect(result.processed).toContain('#336699');
    expect(result.stats.colors).toBeGreaterThan(0);
  });

  it('detects and formats dashboard widgets', async () => {
    const content = `Overview analytics\nRevenue | $12,400 | +8%\nOrders | 320 | +3%`;

    expect(engine.detectType(content)).toBe('dashboard');
    const result = await engine.applyLayout(content);
    expect(result.processed).toContain('# Dashboard');
    expect(result.processed).toContain('| Revenue |');
    expect(result.stats.widgets).toBe(2);
  });

  it('detects and formats document structure', async () => {
    const content = `Project Guide\nChapter 1: Introduction\nThis is the opening paragraph.\nfootnote: See appendix for details.`;

    expect(engine.detectType(content)).toBe('document');
    const result = await engine.applyLayout(content);
    expect(result.processed).toContain('# Project Guide');
    expect(result.stats.sections).toBeGreaterThan(0);
  });

  it('detects and formats storefront catalog', async () => {
    const content = `Shop Inventory\nCategory: Apparel\nFeatured T-Shirt 19.99\nJeans 49.99\nCategory: Accessories\nBelt 24.99`;

    expect(engine.detectType(content)).toBe('storefront');
    const result = await engine.applyLayout(content);
    expect(result.processed).toContain('# Shop Inventory');
    expect(result.processed).toContain('| Product |');
    expect(result.stats.products).toBeGreaterThan(0);
  });

  it('allows explicit type override', async () => {
    const content = 'Revenue | $100 | +5%';
    const result = await engine.applyLayout(content, 'dashboard');
    expect(result.type).toBe('dashboard');
    expect(result.processed).toContain('| Revenue |');
  });

  it('detects audit reports with regex pipes as text, not dashboard', async () => {
    const content = `Cardbey Capability Audit

Execution — gap in runtime
Memory — no unified layer
Reasoner — pattern-only intake

What Still Needs to Be Done
Tool Status Action
validate_store_context X Phantom Remove or implement

Patterns
/how\\s+(?:is | are)\\s+(?:my\\s+)?(?:store | business)
/what(?:'s | is)\\s+(?:my\\s+)?(?:revenue | sales)`;

    expect(engine.detectType(content)).toBe('text');
    const result = await engine.applyLayout(content);
    expect(result.type).toBe('text');
    expect(result.processed).not.toContain('# Dashboard');
    expect(result.processed).toContain('# Cardbey Capability Audit');
  });
});
