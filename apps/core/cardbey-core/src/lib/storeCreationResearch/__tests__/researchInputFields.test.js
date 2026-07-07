import { describe, expect, it } from 'vitest';
import {
  resolveStoreResearchInputFields,
  shouldRunStoreCreationResearchFromFields,
} from '../researchInputFields.js';
import { extractMenuLinesFromHtml } from '../websiteMenuHtmlExtract.js';

describe('researchInputFields', () => {
  it('maps websiteUrl to website for research', () => {
    const fields = resolveStoreResearchInputFields(
      {},
      { businessName: 'Glamshell', websiteUrl: 'https://glamshell.example/services' },
    );
    expect(fields.website).toBe('https://glamshell.example/services');
  });

  it('runs research when business name and category are present', () => {
    expect(
      shouldRunStoreCreationResearchFromFields(
        { businessName: 'Glamshell Beauty' },
        { businessType: 'Salon' },
      ),
    ).toBe(true);
  });
});

describe('extractMenuLinesFromHtml', () => {
  it('parses priced service lines from HTML', () => {
    const html = `
      <ul>
        <li>Women's Haircut 85</li>
        <li>Men's Haircut - $65</li>
        <li>Full Color .... $150</li>
      </ul>
    `;
    const lines = extractMenuLinesFromHtml(html);
    expect(lines.some((l) => /women/i.test(l.name) && l.price === 85)).toBe(true);
    expect(lines.some((l) => /men/i.test(l.name) && l.price === 65)).toBe(true);
    expect(lines.some((l) => /full color/i.test(l.name) && l.price === 150)).toBe(true);
  });
});
