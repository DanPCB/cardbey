import { describe, it, expect, beforeEach } from 'vitest';
import {
  listBrokerActions,
  getBrokerActionForTool,
  getBrokerAction,
  resetActionRegistryCache,
} from './actionRegistry.js';
import { actionIdForTool } from './executionTelemetry.js';

describe('actionRegistry', () => {
  beforeEach(() => {
    resetActionRegistryCache();
  });

  it('lists actions from intake and pipeline catalogs', () => {
    const actions = listBrokerActions();
    expect(actions.length).toBeGreaterThan(20);
    const market = getBrokerActionForTool('market_research');
    expect(market).toBeDefined();
    expect(market.id).toBe(actionIdForTool('market_research'));
    expect(market.telemetryHooks).toContain('broker.execution');
  });

  it('includes capability family actions', () => {
    const promo = getBrokerAction('capability:promo_video');
    expect(promo).toBeDefined();
    expect(promo.capabilityFamily).toBe('promo_video');
    expect(promo.toolName).toBe('video_generate_multimodal');
  });
});
