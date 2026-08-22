/**
 * C2 Core tests — draft-only design mutations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCanonicalDesignPreset } from './designPresets.js';
import {
  buildDesignPresentationEnvelope,
  draftRevisionFingerprint,
  readDesignPresentationEnvelope,
} from './designPresentationEnvelope.js';
import { buildDesignPresentationProjection } from './buildDesignPresentationProjection.js';

describe('designPresets', () => {
  it('maps legacy Dark Luxury label to dark', () => {
    expect(resolveCanonicalDesignPreset('Dark Luxury').presetId).toBe('dark');
    expect(resolveCanonicalDesignPreset('warm').presetId).toBe('warm');
  });

  it('rejects unsupported presets', () => {
    const r = resolveCanonicalDesignPreset('neon-cyber');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_preset');
  });
});

describe('designPresentationEnvelope', () => {
  it('round-trips envelope under preview.website', () => {
    const env = buildDesignPresentationEnvelope({
      templateId: 'minimal',
      source: 'owner_mutation',
      actorId: 'u1',
      bootstrapSource: 'defaults',
    });
    const preview = { website: { designPresentationV1: env, theme: { templateId: 'minimal' } } };
    expect(readDesignPresentationEnvelope(preview)?.templateId).toBe('minimal');
  });

  it('builds fingerprint from draft id + updatedAt', () => {
    expect(
      draftRevisionFingerprint({ id: 'd1', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ).toBe('d1:2026-01-01T00:00:00.000Z');
  });
});

describe('projection after explicit draft design', () => {
  it('prefers designPresentationV1 template over live miniWebsite without hiding live conflict note', () => {
    const out = buildDesignPresentationProjection({
      business: {
        id: 'b1',
        stylePreferences: { miniWebsite: { theme: { templateId: 'warm' } } },
      },
      draft: {
        id: 'd1',
        updatedAt: '2026-01-01T00:00:00.000Z',
        preview: {
          website: {
            theme: { templateId: 'minimal' },
            designPresentationV1: {
              contractVersion: 'designPresentationV1',
              templateId: 'minimal',
            },
          },
        },
      },
      editingContext: { storeId: 'b1', draftId: 'd1' },
      flagEnabled: true,
    });
    expect(out.projection.template.value).toBe('minimal');
    expect(out.projection.template.provenance).toBe('draft_store');
    expect(out.unpublishedDesignChanges).toBe(true);
    expect(out.mutationCapabilities.setTemplate).toBe(true);
  });
});
