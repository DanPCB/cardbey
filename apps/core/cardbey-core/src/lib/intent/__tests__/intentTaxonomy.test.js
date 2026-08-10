/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { INTENT_TYPE_LIST } from '../constants.js';
import {
  INTENT_TAXONOMY,
  fromIntentFirstType,
  fromMultiAgentIntent,
  isKnownIntentType,
  normalizeIntentType,
  toMultiAgentIntent,
} from '../intentTaxonomy.ts';

describe('unified intent taxonomy (Phase 2)', () => {
  it('has taxonomy metadata for every INTENT_TYPE_LIST value', () => {
    for (const intent of INTENT_TYPE_LIST) {
      expect(INTENT_TAXONOMY[intent]).toBeDefined();
      expect(INTENT_TAXONOMY[intent].category).toBeTruthy();
      expect(typeof INTENT_TAXONOMY[intent].executable).toBe('boolean');
      expect(INTENT_TAXONOMY[intent].description).toBeTruthy();
    }
  });

  it('maps multiAgent intents to canonical types', () => {
    expect(fromMultiAgentIntent('STORE_SETUP')).toBe('create_store');
    expect(fromMultiAgentIntent('MISSION_PLANNING')).toBe('create_store');
    expect(fromMultiAgentIntent('STORE_UPDATE')).toBe('update_store');
    expect(fromMultiAgentIntent('STORE_QUERY')).toBe('view_store');
    expect(fromMultiAgentIntent('GENERAL_QUERY')).toBe('general_chat');
    expect(fromMultiAgentIntent('SUPPORT')).toBe('get_help');
  });

  it('maps Intent-First types to canonical types', () => {
    expect(fromIntentFirstType('greeting')).toBe('general_chat');
    expect(fromIntentFirstType('help')).toBe('get_help');
    expect(fromIntentFirstType('clarify')).toBe('clarification');
    expect(fromIntentFirstType('analytics')).toBe('view_analytics');
    expect(fromIntentFirstType('manage_catalog')).toBe('list_products');
    expect(fromIntentFirstType('create_store')).toBe('create_store');
  });

  it('normalizes unknown strings to general_chat', () => {
    expect(normalizeIntentType('not_a_real_intent')).toBe('general_chat');
    expect(normalizeIntentType('create_store')).toBe('create_store');
    expect(isKnownIntentType('create_store')).toBe(true);
    expect(isKnownIntentType('store_create')).toBe(false);
  });

  it('round-trips common multiAgent mappings', () => {
    expect(toMultiAgentIntent('create_store')).toBe('STORE_SETUP');
    expect(toMultiAgentIntent('get_help')).toBe('SUPPORT');
    expect(fromMultiAgentIntent(toMultiAgentIntent('view_store'))).toBe('view_store');
  });
});
