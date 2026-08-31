import { describe, expect, it, vi, beforeEach } from 'vitest';
import { detectMenuSources } from '../menuPageDetector.js';
import {
  buildMenuSynthesisDescription,
  isFoodBusinessCategory,
} from '../menuFetchOrchestrator.js';
import { EnrichmentBudget } from '../budget.js';

vi.mock('../../../llm/llmGateway.js', () => ({
  llmGateway: {
    generate: vi.fn(),
  },
}));

describe('Menu extraction', () => {
  describe('detectMenuSources', () => {
    it('detects /menu URL in nav links', () => {
      const html = '<a href="/menu">Our Menu</a>';
      const sources = detectMenuSources(html, 'https://test.com.au', null);
      expect(sources.length).toBeGreaterThan(0);
      expect(sources[0].url).toBe('https://test.com.au/menu');
      expect(sources[0].confidence).toBeGreaterThan(0.8);
    });

    it('detects Zomato link as third-party menu source', () => {
      const html =
        '<a href="https://www.zomato.com/melbourne/test-restaurant">View on Zomato</a>';
      const sources = detectMenuSources(html, 'https://test.com.au', null);
      expect(sources.some((s) => s.type === 'third_party')).toBe(true);
    });

    it('detects Vietnamese menu link text', () => {
      const html = '<a href="/thuc-don">Thực đơn</a>';
      const sources = detectMenuSources(html, 'https://test.com.au', null);
      expect(sources.length).toBeGreaterThan(0);
    });

    it('ignores non-menu links', () => {
      const html = '<a href="/about">About us</a><a href="/contact">Contact</a>';
      const sources = detectMenuSources(html, 'https://test.com.au', null);
      expect(sources.length).toBe(0);
    });
  });

  describe('isFoodBusinessCategory', () => {
    it('returns true for Food & Drink', () => {
      expect(isFoodBusinessCategory('Food & Drink', 'restaurant')).toBe(true);
    });

    it('returns true for bare food and fast_food categories', () => {
      expect(isFoodBusinessCategory('food', null)).toBe(true);
      expect(isFoodBusinessCategory('fast_food', null)).toBe(true);
    });

    it('returns true when business name signals bakery', () => {
      expect(isFoodBusinessCategory(null, null, 'Papabear Bakehouse')).toBe(true);
    });

    it('returns false for Professional', () => {
      expect(isFoodBusinessCategory('Professional', 'Legal')).toBe(false);
    });
  });

  describe('buildMenuSynthesisDescription', () => {
    it('constructs description from name + category when candidate description is thin', () => {
      const text = buildMenuSynthesisDescription({
        businessName: 'Papabear Bakehouse',
        category: 'bakery',
        subCategory: null,
        suburb: 'Braybrook',
        description: 'A local bakery in Braybrook.',
      });
      expect(text).toContain('Papabear Bakehouse');
      expect(text).toContain('bakery');
      expect(text).toContain('Braybrook');
    });
  });

  describe('extractMenuFromHtml', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('extracts priced items via heuristic HTML parser', async () => {
      const { extractMenuFromHtml } = await import('../menuExtractor.js');
      const html = `
        <ul>
          <li>Pho Bo - $14.90</li>
          <li>Bun Bo Hue - $15.50</li>
          <li>Banh Mi - $9.90</li>
          <li>Com Tam - $13.50</li>
        </ul>
      `;
      const budget = new EnrichmentBudget();
      const result = await extractMenuFromHtml(
        budget,
        html,
        'Pho Ngon',
        'restaurant',
        'website_menu_page',
      );
      expect(result).not.toBeNull();
      expect(result!.items.length).toBeGreaterThanOrEqual(3);
      const priced = result!.items.filter((i) => i.price !== null);
      priced.forEach((i) => expect(typeof i.price).toBe('number'));
    });
  });

  describe('synthesiseMenuFromDescription', () => {
    it('never invents prices when LLM returns structured JSON', async () => {
      const { llmGateway } = await import('../../../llm/llmGateway.js');
      vi.mocked(llmGateway.generate).mockResolvedValue({
        text: JSON.stringify({
          items: [
            {
              name: 'Pho Bo',
              description: 'Traditional beef noodle soup',
              price: 12,
              priceDisplay: 'AUD 12.00',
              category: 'Soup',
              dietaryTags: [],
              isSignatureDish: false,
            },
            {
              name: 'Bun Bo Hue',
              description: 'Spicy beef noodle soup',
              price: 14,
              category: 'Soup',
              dietaryTags: [],
              isSignatureDish: false,
            },
            {
              name: 'Banh Mi',
              description: 'Vietnamese baguette',
              price: 9,
              category: 'Sandwich',
              dietaryTags: [],
              isSignatureDish: false,
            },
          ],
          sections: ['Mains'],
          currency: 'AUD',
          confidence: 'low',
        }),
        provider: 'anthropic',
        model: 'test',
        cached: false,
        usage: { inputTokens: 0, outputTokens: 0 },
      } as Awaited<ReturnType<typeof llmGateway.generate>>);

      const { synthesiseMenuFromDescription } = await import('../menuExtractor.js');
      const budget = new EnrichmentBudget();
      const result = await synthesiseMenuFromDescription(
        budget,
        'Pho Ngon',
        'Traditional Vietnamese restaurant serving pho and rice dishes in Footscray',
        'vietnamese restaurant',
        'Footscray',
      );
      expect(result).not.toBeNull();
      result!.items.forEach((item) => {
        expect(item.price).toBeNull();
        expect(item.priceDisplay).toBeNull();
        expect(item.extractionSource).toBe('claude_synthesis');
      });
    });
  });

  describe('fetchAndExtractMenu', () => {
    it('returns null for non-F&B businesses', async () => {
      const { fetchAndExtractMenu } = await import('../menuFetchOrchestrator.js');
      const budget = new EnrichmentBudget();
      const result = await fetchAndExtractMenu({
        budget,
        businessName: 'Law Firm',
        category: 'Professional',
        subCategory: 'Legal',
        suburb: 'Melbourne',
        description: 'Legal services',
        websiteHtml: null,
        baseUrl: null,
        googlePlacesData: null,
      });
      expect(result).toBeNull();
    });

    it('synthesises menu for thin-data F&B with no website', async () => {
      const { llmGateway } = await import('../../../llm/llmGateway.js');
      vi.mocked(llmGateway.generate).mockResolvedValue({
        text: JSON.stringify({
          items: [
            { name: 'Sourdough Loaf', description: 'Fresh baked', category: 'Bread' },
            { name: 'Croissant', description: 'Buttery pastry', category: 'Pastries' },
            { name: 'Cinnamon Roll', description: 'Sweet roll', category: 'Pastries' },
          ],
          sections: ['Bread', 'Pastries'],
          currency: 'AUD',
          confidence: 'low',
        }),
        provider: 'anthropic',
        model: 'test',
        cached: false,
        usage: { inputTokens: 0, outputTokens: 0 },
      } as Awaited<ReturnType<typeof llmGateway.generate>>);

      const { fetchAndExtractMenu } = await import('../menuFetchOrchestrator.js');
      const budget = new EnrichmentBudget();
      const result = await fetchAndExtractMenu({
        budget,
        businessName: 'Papabear Bakehouse',
        category: 'bakery',
        subCategory: null,
        suburb: 'Braybrook',
        description: 'A local bakery.',
        websiteHtml: null,
        baseUrl: null,
        googlePlacesData: null,
      });

      expect(result).not.toBeNull();
      expect(result!.items.length).toBeGreaterThanOrEqual(3);
      expect(result!.source).toBe('claude_synthesis');
      expect(result!.confidence).toBe('low');
      expect(result!.items.every((i) => i.price === null)).toBe(true);
    });
  });
});
