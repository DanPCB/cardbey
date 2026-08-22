/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { mergeWebsiteIntoPreview } from './websiteSectionsGenerator.js';
import {
  applyFoundationToSectionsAndPreview,
  mapLayoutSectionType,
  resolveSectionOrderFromLayout,
  resolveThemeTokensFromDefinition,
} from './websiteTemplateFoundation.js';

describe('websiteTemplateFoundation', () => {
  it('maps layout section aliases to preview types', () => {
    expect(mapLayoutSectionType('services')).toBe('show');
    expect(mapLayoutSectionType('testimonials')).toBe('social_proof');
    expect(mapLayoutSectionType('hero')).toBe('hero');
  });

  it('uses beauty slug section order when layoutDefinition empty', () => {
    expect(resolveSectionOrderFromLayout(null, 'beauty-wellness-website')[2]).toBe('about');
  });

  it('resolves beauty theme tokens from slug defaults', () => {
    const theme = resolveThemeTokensFromDefinition(null, 'beauty-wellness-website');
    expect(theme.primary).toBe('#db2777');
    expect(theme.templateId).toBe('minimal');
  });

  it('mergeWebsiteIntoPreview Adaptive path keeps default section order', () => {
    const preview = {
      storeName: 'Test Cafe',
      storeType: 'Food & drink',
      items: [{ id: 'p1', name: 'Latte' }],
    };
    mergeWebsiteIntoPreview(preview, {});
    expect(preview.website.sections.map((s) => s.type)).toEqual([
      'hero',
      'usp_bar',
      'show',
      'social_proof',
      'about',
      'contact',
    ]);
    expect(preview.website.theme.templateId).toBe('warm');
    expect(preview.websiteTemplateId).toBeFalsy();
  });

  it('mergeWebsiteIntoPreview applies Beauty foundation theme + section order', () => {
    const preview = {
      storeName: 'Glow Spa',
      storeType: 'Beauty',
      items: [{ id: 'p1', name: 'Facial' }],
      brandColors: { primary: '#111', secondary: '#222' },
    };
    const foundation = {
      websiteTemplateId: 'tpl_beauty',
      slug: 'beauty-wellness-website',
      name: 'Beauty & wellness',
      theme: resolveThemeTokensFromDefinition(null, 'beauty-wellness-website'),
      sectionOrder: resolveSectionOrderFromLayout(null, 'beauty-wellness-website'),
    };
    mergeWebsiteIntoPreview(preview, { websiteTemplateFoundation: foundation });
    expect(preview.brandColors.primary).toBe('#db2777');
    expect(preview.website.sections.map((s) => s.type)).toEqual([
      'hero',
      'usp_bar',
      'about',
      'show',
      'social_proof',
      'contact',
    ]);
    expect(preview.website.theme.templateId).toBe('minimal');
    expect(preview.websiteTemplateId).toBe('tpl_beauty');
  });

  it('applyFoundationToSectionsAndPreview is no-op without foundation', () => {
    const sections = [{ type: 'hero', content: {} }];
    const preview = {};
    expect(applyFoundationToSectionsAndPreview(preview, sections, null)).toBe(sections);
  });
});
