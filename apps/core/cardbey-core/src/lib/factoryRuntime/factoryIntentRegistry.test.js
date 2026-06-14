import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerFactoryIntent,
  resolveFactoryIntent,
  clearFactoryIntentsForTests,
} from './factoryIntentRegistry.js';

describe('factoryIntentRegistry', () => {
  beforeEach(() => {
    clearFactoryIntentsForTests();
  });

  it('resolves by label pattern and factoryId', () => {
    registerFactoryIntent({
      id: 'test_campaign',
      factoryId: 'campaign_package_factory_v1',
      priority: 50,
      patterns: { labels: ['campaign_package'] },
    });

    const resolved = resolveFactoryIntent({ intentLabel: 'campaign_package', userMessage: '' });
    expect(resolved?.factoryId).toBe('campaign_package_factory_v1');
  });

  it('respects priority ordering', () => {
    registerFactoryIntent({
      id: 'low',
      factoryId: 'factory_low',
      priority: 10,
      patterns: { labels: ['shared_label'] },
    });
    registerFactoryIntent({
      id: 'high',
      factoryId: 'factory_high',
      priority: 90,
      patterns: { labels: ['shared_label'] },
    });

    const resolved = resolveFactoryIntent({ intentLabel: 'shared_label', userMessage: '' });
    expect(resolved?.factoryId).toBe('factory_high');
  });
});
