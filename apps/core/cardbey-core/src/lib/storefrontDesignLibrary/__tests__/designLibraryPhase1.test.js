import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  assertStorefrontBlueprint,
  assertVisualTheme,
  assertStorefrontPreviewSample,
  SAMPLE_CONTENT_POLICY_DISPOSABLE,
  section,
  getBlueprint,
  listBlueprints,
  hasBlueprint,
  getVisualTheme,
  listVisualThemes,
  hasVisualTheme,
  getPreviewSample,
  listPreviewSamples,
  hasPreviewSample,
  isThemeCompatibleWithBlueprint,
  __reinitializeDesignLibraryRegistriesForTests,
  mapLegacyThemeTemplateIdToVisualThemeId,
  adaptContentTemplateToPreviewSample,
  adaptLayoutDefinitionToStructuralMetadata,
  isDesignLibraryV1Enabled,
  isDesignLibraryAuthoritative,
  getDesignLibraryDiagnostics,
} from '../index.js';
import { registerBlueprint } from '../registries/blueprintRegistry.js';
import { registerVisualTheme } from '../registries/visualThemeRegistry.js';
import { registerPreviewSample } from '../registries/previewSampleRegistry.js';
import {
  __resetBlueprintRegistryForTests,
  sealBlueprintRegistry,
} from '../registries/blueprintRegistry.js';
import {
  __resetVisualThemeRegistryForTests,
  sealVisualThemeRegistry,
} from '../registries/visualThemeRegistry.js';
import {
  __resetPreviewSampleRegistryForTests,
  sealPreviewSampleRegistry,
} from '../registries/previewSampleRegistry.js';

function minimalBlueprint(id = 'test-blueprint') {
  return {
    id,
    version: 1,
    name: 'Test',
    preferredBusinessModels: ['retail'],
    supportedContentRoles: ['product'],
    supportedActions: ['buy'],
    requiredData: [],
    optionalData: [],
    defaultSections: [section('hero'), section('footer')],
  };
}

describe('Storefront Design Library Phase 1 — contracts', () => {
  it('accepts a valid blueprint', () => {
    const bp = assertStorefrontBlueprint(minimalBlueprint());
    expect(bp.id).toBe('test-blueprint');
    expect(bp.defaultSections).toHaveLength(2);
  });

  it('rejects invalid section role', () => {
    expect(() =>
      assertStorefrontBlueprint({
        ...minimalBlueprint(),
        defaultSections: [{ ...section('hero'), role: 'not_a_role' }],
      }),
    ).toThrow(/Invalid section role/);
  });

  it('rejects invalid action', () => {
    expect(() =>
      assertStorefrontBlueprint({
        ...minimalBlueprint(),
        supportedActions: ['teleport'],
      }),
    ).toThrow(/invalid action/);
  });

  it('rejects invalid version', () => {
    expect(() => assertStorefrontBlueprint({ ...minimalBlueprint(), version: 0 })).toThrow(/version/);
    expect(() => assertVisualTheme({ id: 't', version: 1.5, name: 'T', tokens: {} })).toThrow(/version/);
  });

  it('requires disposable sample content policy', () => {
    expect(() =>
      assertStorefrontPreviewSample({
        id: 'p',
        version: 1,
        name: 'P',
        blueprintId: 'trade-lead-generation',
        themeId: 'premium-blue',
        sampleBusiness: { name: 'X' },
        tags: [],
        recommendedBusinessModels: ['service_quote'],
        sampleContentPolicy: 'authoritative',
      }),
    ).toThrow(/disposable_demo_only/);
  });
});

describe('Storefront Design Library Phase 1 — registries', () => {
  beforeEach(() => {
    __reinitializeDesignLibraryRegistriesForTests();
  });

  it('register/get/list exposes initial definitions', () => {
    expect(hasBlueprint('trade-lead-generation')).toBe(true);
    expect(getBlueprint('trade-lead-generation')?.name).toMatch(/Trade/i);
    expect(listBlueprints().length).toBe(5);
    expect(hasVisualTheme('premium-blue')).toBe(true);
    expect(listVisualThemes().length).toBe(4);
    expect(hasPreviewSample('trades-and-services')).toBe(true);
    expect(listPreviewSamples().length).toBe(4);
    expect(getPreviewSample('unknown-id')).toBeNull();
  });

  it('rejects duplicate blueprint ids before seal', () => {
    __resetBlueprintRegistryForTests();
    registerBlueprint(minimalBlueprint('dup'));
    expect(() => registerBlueprint(minimalBlueprint('dup'))).toThrow(/Duplicate blueprint/);
    sealBlueprintRegistry();
  });

  it('is sealed after initialization (no runtime mutation)', () => {
    expect(() => registerBlueprint(minimalBlueprint('after-seal'))).toThrow(/sealed/);
    expect(() =>
      registerVisualTheme({ id: 'x', version: 1, name: 'X', tokens: {} }),
    ).toThrow(/sealed/);
    expect(() =>
      registerPreviewSample({
        id: 'x',
        version: 1,
        name: 'X',
        blueprintId: 'trade-lead-generation',
        themeId: 'premium-blue',
        sampleBusiness: {},
        tags: [],
        recommendedBusinessModels: [],
        sampleContentPolicy: SAMPLE_CONTENT_POLICY_DISPOSABLE,
      }),
    ).toThrow(/sealed/);
  });
});

describe('Storefront Design Library Phase 1 — cross-reference validation', () => {
  beforeEach(() => {
    __resetBlueprintRegistryForTests();
    __resetVisualThemeRegistryForTests();
    __resetPreviewSampleRegistryForTests();
  });

  afterEach(() => {
    __reinitializeDesignLibraryRegistriesForTests();
  });

  it('rejects preview with unknown blueprint', () => {
    registerBlueprint(minimalBlueprint('ok-bp'));
    registerVisualTheme(
      {
        id: 'ok-theme',
        version: 1,
        name: 'Ok',
        tokens: { palette: { primary: '#000' } },
        supportedBlueprints: ['ok-bp'],
      },
      { requireKnownBlueprints: true },
    );
    expect(() =>
      registerPreviewSample({
        id: 'bad-preview',
        version: 1,
        name: 'Bad',
        blueprintId: 'missing-bp',
        themeId: 'ok-theme',
        sampleBusiness: {},
        tags: [],
        recommendedBusinessModels: [],
        sampleContentPolicy: SAMPLE_CONTENT_POLICY_DISPOSABLE,
      }),
    ).toThrow(/unknown blueprint/);
    sealBlueprintRegistry();
    sealVisualThemeRegistry();
    sealPreviewSampleRegistry();
  });

  it('rejects preview with unknown theme', () => {
    registerBlueprint(minimalBlueprint('ok-bp'));
    expect(() =>
      registerPreviewSample({
        id: 'bad-preview',
        version: 1,
        name: 'Bad',
        blueprintId: 'ok-bp',
        themeId: 'missing-theme',
        sampleBusiness: {},
        tags: [],
        recommendedBusinessModels: [],
        sampleContentPolicy: SAMPLE_CONTENT_POLICY_DISPOSABLE,
      }),
    ).toThrow(/unknown theme/);
    sealBlueprintRegistry();
    sealVisualThemeRegistry();
    sealPreviewSampleRegistry();
  });

  it('rejects unsupported theme/blueprint combination', () => {
    registerBlueprint(minimalBlueprint('ok-bp'));
    registerBlueprint(minimalBlueprint('other-bp'));
    registerVisualTheme({
      id: 'narrow-theme',
      version: 1,
      name: 'Narrow',
      tokens: {},
      supportedBlueprints: ['ok-bp'],
    });
    expect(isThemeCompatibleWithBlueprint('narrow-theme', 'other-bp')).toBe(false);
    expect(() =>
      registerPreviewSample({
        id: 'mismatch',
        version: 1,
        name: 'Mismatch',
        blueprintId: 'other-bp',
        themeId: 'narrow-theme',
        sampleBusiness: {},
        tags: [],
        recommendedBusinessModels: [],
        sampleContentPolicy: SAMPLE_CONTENT_POLICY_DISPOSABLE,
      }),
    ).toThrow(/does not support blueprint/);
    sealBlueprintRegistry();
    sealVisualThemeRegistry();
    sealPreviewSampleRegistry();
  });
});

describe('Storefront Design Library Phase 1 — adapters', () => {
  beforeEach(() => {
    __reinitializeDesignLibraryRegistriesForTests();
  });

  it('maps ContentTemplate slug to preview sample metadata', () => {
    const adapted = adaptContentTemplateToPreviewSample(
      {
        id: 'ctmpl_1',
        slug: 'trades-home-services-website',
        name: 'Trades & home services website',
        industry: 'trades',
        tags: ['trades'],
        contentType: 'STORE_WEBSITE',
      },
      {
        versionNumber: 1,
        themeDefinition: { primaryColor: '#b45309', templateId: 'bold' },
        layoutDefinition: {
          sections: [
            { id: 'hero', type: 'hero', order: 0 },
            { id: 'usp', type: 'usp', order: 1 },
            { id: 'reviews', type: 'reviews', order: 2 },
          ],
        },
      },
    );
    expect(adapted.contentTemplateId).toBe('ctmpl_1');
    expect(adapted.previewSampleId).toBe('trades-and-services');
    expect(adapted.blueprintId).toBe('trade-lead-generation');
    expect(adapted.legacyThemeTemplateId).toBe('bold');
    expect(adapted.themeId).toBe('premium-blue');
    expect(adapted.sampleContentPolicy).toBe(SAMPLE_CONTENT_POLICY_DISPOSABLE);
    expect(adapted.sampleBusiness.__disposableDemo).toBe(true);
  });

  it('maps legacy visual enum to canonical theme', () => {
    expect(mapLegacyThemeTemplateIdToVisualThemeId('minimal')).toBe('minimal-white');
    expect(mapLegacyThemeTemplateIdToVisualThemeId('warm')).toBe('warm-natural');
    expect(mapLegacyThemeTemplateIdToVisualThemeId('dark-luxury')).toBe('bold-dark');
    expect(mapLegacyThemeTemplateIdToVisualThemeId('unknown')).toBeNull();
  });

  it('maps website layout to structural section metadata', () => {
    const structural = adaptLayoutDefinitionToStructuralMetadata({
      sections: [
        { id: 'navigation', type: 'navigation', order: 0 },
        { id: 'hero', type: 'hero', order: 1 },
        { id: 'reviews', type: 'reviews', order: 2 },
      ],
    });
    expect(structural.sections.find((s) => s.legacyType === 'hero')?.role).toBe('hero');
    expect(structural.sections.find((s) => s.legacyType === 'reviews')?.role).toBe('testimonials');
    expect(structural.sections.every((s) => typeof s.legacyWebsiteSectionType === 'string' || s.legacyWebsiteSectionType === null)).toBe(
      true,
    );
  });
});

describe('Storefront Design Library Phase 1 — flag behavior', () => {
  const prev = process.env.ENABLE_DESIGN_LIBRARY_V1;

  afterEach(() => {
    if (prev === undefined) delete process.env.ENABLE_DESIGN_LIBRARY_V1;
    else process.env.ENABLE_DESIGN_LIBRARY_V1 = prev;
  });

  it('flag off empties diagnostics counts (no live authority)', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'false';
    expect(isDesignLibraryV1Enabled()).toBe(false);
    expect(isDesignLibraryAuthoritative()).toBe(false);
    const d = getDesignLibraryDiagnostics();
    expect(d.enabled).toBe(false);
    expect(d.blueprintCount).toBe(0);
  });

  it('flag on exposes registries without becoming authoritative', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    expect(isDesignLibraryV1Enabled()).toBe(true);
    expect(isDesignLibraryAuthoritative()).toBe(false);
    const d = getDesignLibraryDiagnostics();
    expect(d.enabled).toBe(true);
    expect(d.authoritative).toBe(false);
    expect(d.blueprintCount).toBe(5);
  });
});
