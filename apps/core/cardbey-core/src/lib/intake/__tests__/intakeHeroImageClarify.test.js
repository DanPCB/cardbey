import { describe, expect, it } from 'vitest';
import {
  isHeroImageChangeMessage,
  hasIntakeImageAttachment,
  buildHeroImageClarifyOptions,
  isHeroUiInstructionFallback,
  isGenerationReadyHeroImageRequest,
  buildHeroImageGenerationPrompt,
  shouldAutoGenerateHeroImage,
  tryHeroAutoVisualDirectAction,
} from '../intakeHeroImageClarify.js';
import { resolveIntent } from '../intakeIntentResolver.js';

describe('intakeHeroImageClarify', () => {
  it('detects hero / banner image phrasing', () => {
    expect(isHeroImageChangeMessage('Change hero image to any other photo')).toBe(true);
    expect(isHeroImageChangeMessage('update hero with a new pic')).toBe(true);
    expect(isHeroImageChangeMessage('replace banner image')).toBe(true);
    expect(isHeroImageChangeMessage('change photo on homepage')).toBe(true);
  });

  it('hasIntakeImageAttachment reads attachments array', () => {
    expect(hasIntakeImageAttachment({})).toBe(false);
    expect(hasIntakeImageAttachment({ attachments: [{ type: 'image', uri: 'data:image/png;base64,xxx' }] })).toBe(
      true,
    );
  });

  it('buildHeroImageClarifyOptions returns upload / generate / stock-style chips', () => {
    const opts = buildHeroImageClarifyOptions('en', 'coffee shop hero');
    expect(opts).toHaveLength(3);
    expect(opts.some((o) => o.tool === '__client_hero_upload__')).toBe(true);
    expect(opts.some((o) => o.tool === 'edit_artifact')).toBe(true);
    expect(opts.some((o) => o.tool === '__client_hero_stock__')).toBe(true);
    const gen = opts.find((o) => o.tool === 'edit_artifact');
    expect(String(gen?.parameters?.instruction ?? '')).toContain('coffee shop');
    expect(String(gen?.parameters?.artifactType ?? '')).toBe('hero');
  });

  it('flags legacy UI-instruction copy', () => {
    expect(
      isHeroUiInstructionFallback(
        'Please use the "Change hero image" button in the Website Preview panel on the right.',
      ),
    ).toBe(true);
    expect(isHeroUiInstructionFallback('Your sales were up last week.')).toBe(false);
  });
});

describe('hero auto-generate (generation-ready heuristics)', () => {
  it('A: first-turn descriptive hero request is generation-ready', () => {
    const msg = 'change hero image to fashion style photo';
    expect(isGenerationReadyHeroImageRequest(msg, { conversationHistory: [] })).toBe(true);
    const gate = shouldAutoGenerateHeroImage({ userMessage: msg, conversationHistory: [] });
    expect(gate.ready).toBe(true);
    expect(gate.source).toBe('current_message');
    const built = tryHeroAutoVisualDirectAction({
      userMessage: msg,
      conversationHistory: [],
      persistedHeroSubtype: null,
      missionId: 'm1',
      storeContext: { storeId: 's1', storeLabel: 'My Shop' },
    });
    expect(built).not.toBeNull();
    expect(built.classification.tool).toBe('edit_artifact');
    expect(built.classification.executionPath).toBe('direct_action');
    expect(String(built.classification.parameters.instruction)).toContain('fashion');
    expect(String(built.classification.parameters.artifactType)).toBe('hero');
    expect(built.telemetry.heroAutoGenerateTriggered).toBe(true);
  });

  it('B: follow-up with history + style is generation-ready (history source)', () => {
    const hist = [{ role: 'user', content: 'change hero image' }];
    const msg = 'use a fashion style photo instead';
    expect(isGenerationReadyHeroImageRequest(msg, { conversationHistory: hist })).toBe(true);
    const gate = shouldAutoGenerateHeroImage({ userMessage: msg, conversationHistory: hist });
    expect(gate.ready).toBe(true);
    expect(gate.source).toBe('history');
    const built = tryHeroAutoVisualDirectAction({
      userMessage: msg,
      conversationHistory: hist,
      persistedHeroSubtype: null,
      missionId: null,
      storeContext: { storeId: 's1' },
    });
    expect(built?.classification.tool).toBe('edit_artifact');
  });

  it('B2: persisted change_hero_image + visual follow-up uses persisted_intent source', () => {
    const msg = 'use a minimalist fashion photo instead';
    const built = tryHeroAutoVisualDirectAction({
      userMessage: msg,
      conversationHistory: [],
      persistedHeroSubtype: 'change_hero_image',
      missionId: null,
      storeContext: { storeId: 's1' },
    });
    expect(built?.telemetry.heroAutoGenerateSource).toBe('persisted_intent');
    expect(built?.classification.tool).toBe('edit_artifact');
  });

  it('C: bare hero request is not generation-ready', () => {
    expect(isGenerationReadyHeroImageRequest('change hero image', { conversationHistory: [] })).toBe(false);
    expect(tryHeroAutoVisualDirectAction({ userMessage: 'change hero image', storeContext: { storeId: 's1' } })).toBeNull();
  });

  it('D: negation adds food exclusion to prompt', () => {
    const p = buildHeroImageGenerationPrompt({
      userMessage: 'replace food photo with a luxury fashion visual',
      storeContext: { storeId: 's1' },
    });
    expect(p.toLowerCase()).toMatch(/food|exclude/);
    expect(p.toLowerCase()).toMatch(/fashion|luxury|visual/);
  });
});

describe('resolveIntent — change_hero_image ontology', () => {
  it('maps change hero image to website_edit / change_hero_image', () => {
    const r = resolveIntent({
      userMessage: 'Change hero image to any other photo',
      classification: { tool: 'general_chat', confidence: 0.4, executionPath: 'chat', parameters: {} },
      storeId: 's1',
    });
    expect(r.family).toBe('website_edit');
    expect(r.subtype).toBe('change_hero_image');
    expect(r.candidateTools).toContain('improve_hero');
    expect(r.chosenTool).toBe('improve_hero');
  });

  it('continuity: follow-up fashion/constraints stays website_edit / change_hero_image', () => {
    const history = [{ role: 'user', content: 'change hero image' }];
    const r = resolveIntent({
      userMessage: 'change to a fashion photo to match store context, not food photo',
      classification: { tool: 'analyze_store', confidence: 0.95, executionPath: 'proactive_plan', parameters: {} },
      storeId: 's1',
      conversationHistory: history,
    });
    expect(r.family).toBe('website_edit');
    expect(r.subtype).toBe('change_hero_image');
    expect(r.chosenTool).toBe('improve_hero');
    expect(r.resolverReason).toBe('continuity:change_hero_image');
  });

  it('family priority: replace hero photo with fashion image is not store_improvement', () => {
    const r = resolveIntent({
      userMessage: 'replace hero photo with a fashion image',
      classification: { tool: 'general_chat', confidence: 0.3, executionPath: 'chat', parameters: {} },
      storeId: 's1',
    });
    expect(r.family).toBe('website_edit');
    expect(r.subtype).toBe('change_hero_image');
    expect(r.chosenTool).toBe('improve_hero');
  });

  it('strong analyze_store is ignored for hero continuity (same turn as continuity block)', () => {
    const r = resolveIntent({
      userMessage: 'use something lighter and more modern',
      classification: { tool: 'analyze_store', confidence: 0.95, executionPath: 'proactive_plan', parameters: {} },
      storeId: 's1',
      conversationHistory: [{ role: 'user', content: 'update hero image' }],
    });
    expect(r.subtype).toBe('change_hero_image');
    expect(r.chosenTool).toBe('improve_hero');
    expect(r.resolverReason).toBe('continuity:change_hero_image');
  });
});
