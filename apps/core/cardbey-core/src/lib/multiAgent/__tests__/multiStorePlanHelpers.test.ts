/**
 * Tests for multi-store planning helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  enrichIntentWithMultiStore,
  extractMultiStoreInfo,
  generateMultiStoreClarificationResponse,
  isMultiStoreRequest,
  isVagueLocationPhrase,
} from '../multiStorePlanHelpers.js';
import { Intent } from '../../../multiAgent/types/agent.types.js';

describe('multiStorePlanHelpers', () => {
  it('MS-001 detects incomplete multi-store setup', () => {
    const message = 'Set up 3 stores in different cities';
    expect(isMultiStoreRequest(message)).toBe(true);

    const info = extractMultiStoreInfo(message);
    expect(info.count).toBe(3);
    expect(info.vagueLocation).toBe(true);
    expect(info.missingFields).toEqual(['store_names', 'categories', 'specific_locations']);

    const response = generateMultiStoreClarificationResponse(info);
    expect(response).toContain('different cities (3 stores)');
    expect(response).toContain('Store names: Please provide names for your 3 stores');
    expect(response).toContain('Categories: Please specify categories for each store');
    expect(response).toContain('Store 1: [Name] in [City] - [Category]');
  });

  it('MS-002 asks for names and categories when cities are known', () => {
    const info = extractMultiStoreInfo('Set up stores in Melbourne, Sydney, Brisbane');
    expect(info.locations).toEqual(['Melbourne', 'Sydney', 'Brisbane']);
    expect(info.missingFields).toContain('store_names');
    expect(info.missingFields).toContain('categories');
    expect(info.missingFields).not.toContain('specific_locations');
  });

  it('MS-003 asks only for categories when names and cities are known', () => {
    const message =
      'Set up 3 stores: Glow Beauty (Melbourne), TechGear (Sydney), HomeStyle (Brisbane)';
    const info = extractMultiStoreInfo(message);
    expect(info.names).toEqual(['Glow Beauty', 'TechGear', 'HomeStyle']);
    expect(info.locations).toEqual(['Melbourne', 'Sydney', 'Brisbane']);
    expect(info.missingFields).toEqual(['categories']);
  });

  it('MS-004 accepts fully specified multi-store request', () => {
    const message =
      'Set up 3 stores: Glow Beauty (Melbourne, Beauty), TechGear (Sydney, Electronics), HomeStyle (Brisbane, Home & garden)';
    const info = extractMultiStoreInfo(message);
    expect(info.missingFields).toEqual([]);
    expect(info.names).toHaveLength(3);
    expect(info.categories).toEqual(['Beauty', 'Electronics', 'Home & garden']);
  });

  it('flags vague location phrases', () => {
    expect(isVagueLocationPhrase('different cities')).toBe(true);
    expect(isVagueLocationPhrase('Melbourne')).toBe(false);
  });

  it('enriches intent classification for multi-store requests', () => {
    const enriched = enrichIntentWithMultiStore('Set up 3 stores in different cities', {
      intent: Intent.STORE_SETUP,
      confidence: 0.7,
      entities: {},
    });

    expect(enriched.intent).toBe(Intent.MISSION_PLANNING);
    expect(enriched.needsClarification).toBe(true);
    expect(enriched.missingFields).toContain('store_names');
    expect(enriched.entities?.store_count).toBe(3);
  });
});
