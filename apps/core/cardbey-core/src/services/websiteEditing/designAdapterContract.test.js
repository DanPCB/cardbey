import { describe, it, expect } from 'vitest';
import {
  DESIGN_ADAPTER_COMMANDS,
  DESIGN_READINESS,
  DESIGN_SOURCE_PRECEDENCE,
  isDesignAdapterCommandConfigured,
  isDesignAdapterSection,
} from './designAdapterContract.js';
import { buildDesignPresentationProjection } from './buildDesignPresentationProjection.js';
import { DESIGN_PARALLEL_WRITERS } from './designParallelWriters.js';

describe('designAdapterContract C1', () => {
  it('configures setTemplate and setHero in C2 (still flag-gated at runtime)', () => {
    expect(isDesignAdapterCommandConfigured('setTemplate')).toBe(true);
    expect(isDesignAdapterCommandConfigured('setHero')).toBe(true);
    expect(isDesignAdapterCommandConfigured('setDesignTokens')).toBe(false);
  });

  it('recognises design section aliases', () => {
    expect(isDesignAdapterSection('design')).toBe(true);
    expect(isDesignAdapterSection('presentation')).toBe(true);
    expect(isDesignAdapterSection('catalog')).toBe(false);
  });

  it('documents source precedence', () => {
    expect(DESIGN_SOURCE_PRECEDENCE[0]).toBe('approved_canonical_draft_design');
    expect(DESIGN_SOURCE_PRECEDENCE.at(-1)).toBe('defaults');
  });
});

describe('buildDesignPresentationProjection C1', () => {
  it('returns NOT_ENABLED when flag off without mutating inputs', () => {
    const business = { id: 'b1', stylePreferences: { miniWebsite: { theme: { templateId: 'warm' } } } };
    const out = buildDesignPresentationProjection({
      business,
      draft: null,
      editingContext: null,
      flagEnabled: false,
    });
    expect(out.readiness).toBe(DESIGN_READINESS.NOT_ENABLED);
    expect(out.projection).toBeNull();
    expect(business.stylePreferences.miniWebsite.theme.templateId).toBe('warm');
  });

  it('reports template conflict provenance without choosing a winner', () => {
    const out = buildDesignPresentationProjection({
      business: {
        id: 'b1',
        stylePreferences: { miniWebsite: { theme: { templateId: 'warm' }, sections: [{ type: 'hero' }] } },
      },
      draft: {
        id: 'd1',
        preview: { website: { theme: { templateId: 'cool' }, sections: [{ type: 'hero' }, { type: 'about' }] } },
      },
      editingContext: { storeId: 'b1', draftId: 'd1', editingKind: 'unpublished_revision' },
      flagEnabled: true,
    });
    expect(out.readiness).toBe(DESIGN_READINESS.SOURCE_CONFLICT);
    expect(out.projection.template.provenance).toBe('conflict');
    expect(out.conflicts.some((c) => c.field === 'templateId')).toBe(true);
    expect(out.conflicts.some((c) => c.field === 'sectionOrder')).toBe(true);
  });

  it('lists parallel writers inventory', () => {
    expect(DESIGN_PARALLEL_WRITERS.some((w) => w.id === 'mini_website_sections_patch')).toBe(true);
    expect(DESIGN_PARALLEL_WRITERS.some((w) => w.classification === 'unsafe_for_convergence')).toBe(true);
  });
});
