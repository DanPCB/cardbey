import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  localizeMessage,
  localizeConversation,
  attachConversationLocalization,
  localizeProductView,
  localizeStorefrontView,
  applyStorefrontLocalizeShadow,
  renderDualLanguage,
  withViewMode,
  buildDualLanguageView,
  setTranslationProvider,
  createStubTranslationProvider,
  __resetTranslationProviderForTests,
  __resetTranslationCacheForTests,
  __resetTranslationMemoryForTests,
  __resetTranslationAuditForTests,
  __reinitializeLanguageIntelligenceRegistriesForTests,
  getLanguageIntelligenceDiagnostics,
  CONVERSATION_TRANSLATOR_VERSION,
  STOREFRONT_LOCALIZER_VERSION,
} from '../index.js';

describe('Language Intelligence Phase 3 — DualLanguageRenderer', () => {
  it('supports View Original / Both and attribution', () => {
    const view = buildDualLanguageView({
      mode: 'translated',
      originalLanguage: 'vi',
      originalText: 'Xin chào',
      localizedLanguage: 'en',
      localizedText: 'Hello',
    });
    const rendered = renderDualLanguage(view);
    expect(rendered.primary).toBe('Hello');
    expect(rendered.actions.viewOriginal).toBe(true);
    expect(rendered.labels.viewOriginal).toBe('View Original');
    expect(rendered.attribution).toMatch(/Cardbey AI/);

    const both = renderDualLanguage(withViewMode(view, 'both'));
    expect(both.primary).toBe('Hello');
    expect(both.secondary).toBe('Xin chào');
  });
});

describe('Language Intelligence Phase 3 — ConversationTranslator', () => {
  beforeEach(() => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONVERSATION_V1 = 'true';
    __reinitializeLanguageIntelligenceRegistriesForTests();
    __resetTranslationCacheForTests();
    __resetTranslationMemoryForTests();
    __resetTranslationAuditForTests();
    __resetTranslationProviderForTests();
    setTranslationProvider(createStubTranslationProvider({ prefix: 'CHAT' }));
  });

  afterEach(() => {
    __resetTranslationProviderForTests();
  });

  it('localizes a message without mutating canonical content', async () => {
    const message = { id: 'm1', content: { text: 'Bánh mì ngon' } };
    const result = await localizeMessage({
      message,
      targetLanguage: 'en',
      mode: 'translated',
    });
    expect(result.canonicalPreserved).toBe(true);
    expect(result.dualLanguageView.originalText).toBe('Bánh mì ngon');
    expect(result.dualLanguageView.localizedText).toBe('CHAT:en:Bánh mì ngon');
    expect(result.render.actions.viewOriginal).toBe(true);
    expect(message.content.text).toBe('Bánh mì ngon');
  });

  it('skips same-language and attaches side-channel', async () => {
    const messages = [
      { id: 'a', content: 'Hello there' },
      { id: 'b', content: { text: 'Cafe sữa đá' } },
    ];
    const localized = await localizeConversation({
      messages,
      targetLanguage: 'en',
      autoTranslateConversation: true,
      force: true,
    });
    expect(localized.enabled).toBe(true);
    expect(localized.version).toBe(CONVERSATION_TRANSLATOR_VERSION);
    expect(localized.results[0].skipped).toBe('same_language');
    expect(localized.results[1].dualLanguageView.localizedText).toMatch(/^CHAT:en:/);

    const attached = attachConversationLocalization(messages, localized);
    expect(attached[1].languageIntelligence.render.primary).toMatch(/^CHAT:en:/);
    expect(attached[1].content.text).toBe('Cafe sữa đá');
  });

  it('respects autoTranslateConversation=false', async () => {
    const result = await localizeMessage({
      message: { id: 'm2', text: 'Phở bò' },
      targetLanguage: 'en',
      autoTranslate: false,
    });
    expect(result.skipped).toBe('auto_off');
    expect(result.dualLanguageView.localizedText).toBeNull();
  });
});

describe('Language Intelligence Phase 3 — StorefrontLocalizer', () => {
  beforeEach(() => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_STOREFRONT_LOCALIZER_V1 = 'true';
    __reinitializeLanguageIntelligenceRegistriesForTests();
    __resetTranslationCacheForTests();
    __resetTranslationMemoryForTests();
    __resetTranslationProviderForTests();
    setTranslationProvider(createStubTranslationProvider({ prefix: 'SF' }));
  });

  afterEach(() => {
    __resetTranslationProviderForTests();
  });

  it('reads translations layer without generating', async () => {
    const product = {
      id: 'p1',
      name: 'Bánh Mì Đặc Biệt',
      description: 'Ngon',
      category: 'Food',
      translations: {
        en: { name: 'Special Vietnamese Bánh Mì', description: 'Delicious' },
      },
    };
    const view = await localizeProductView({
      product,
      targetLanguage: 'en',
      mode: 'both',
      force: true,
    });
    expect(view.enabled).toBe(true);
    expect(view.version).toBe(STOREFRONT_LOCALIZER_VERSION);
    expect(view.localized.name).toBe('Special Vietnamese Bánh Mì');
    expect(view.fieldRenders.name.secondary).toBe('Bánh Mì Đặc Biệt');
    expect(view.canonicalPreserved).toBe(true);
    expect(product.name).toBe('Bánh Mì Đặc Biệt');
  });

  it('generates missing translations via engine and attaches shadow meta', async () => {
    const store = { id: 's1', name: 'Quán Việt', description: 'Ngon', translations: null };
    const products = [{ id: 'p2', name: 'Phở', description: null, category: null, translations: null }];
    const localized = await localizeStorefrontView({
      store,
      products,
      targetLanguage: 'en',
      generateIfMissing: true,
      force: true,
    });
    expect(localized.store.localized.name).toBe('SF:en:Quán Việt');
    expect(localized.products[0].localized.name).toBe('SF:en:Phở');
    expect(localized.store.translationsPatch).toBeTruthy();
    expect(localized.store.translationsPatch).not.toHaveProperty('name');

    const { dto, attached } = applyStorefrontLocalizeShadow({ id: 's1', name: 'Quán Việt', meta: {} }, localized);
    expect(attached).toBe(true);
    expect(dto.meta.languageIntelligence.authoritative).toBe(false);
    expect(dto.name).toBe('Quán Việt');
  });
});

describe('Language Intelligence Phase 3 — diagnostics', () => {
  it('reports phase 3 when conversation/storefront flags on', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONVERSATION_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_STOREFRONT_LOCALIZER_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1 = 'false';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1 = 'false';
    const d = getLanguageIntelligenceDiagnostics();
    expect(d.phase).toBe(3);
    expect(d.conversation.enabled).toBe(true);
    expect(d.storefrontLocalizer.enabled).toBe(true);
    expect(d.authoritative).toBe(false);
  });
});
