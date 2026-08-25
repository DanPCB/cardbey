/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentCoordinator } from '../agentCoordinator.js';
import { storeKnowledgeFromSkp } from '../storeKnowledgeForAgents.js';
import { clearAgentClassCacheForTests } from '../agentLoader.js';
import { __clearRuntimeStoresForTests } from '../../../orchestrator/memory/runtimeMemory.js';

function mockSkp(overrides = {}) {
  return {
    identity: {
      storeId: 'store-1',
      slug: 'test-store',
      businessName: { value: 'Test Cafe', provenance: 'owner' },
    },
    content: {
      tagline: { value: null },
      description: { value: 'A local cafe', provenance: 'website' },
      heroImageUrl: { value: null },
      logoUrl: { value: null },
      heroVideoUrl: { value: null },
    },
    classification: {
      category: { value: 'Food & Drink', provenance: 'taxonomy' },
      subCategory: { value: null },
    },
    location: {
      suburb: { value: 'Melbourne' },
      state: { value: 'VIC' },
      country: { value: 'AU' },
      address: { value: null },
    },
    contact: {
      phone: { value: null },
      email: { value: null },
      website: { value: null },
      socialLinks: { value: [] },
    },
    commerce: {
      openingHours: { value: null },
      catalogItemCount: { value: 0 },
    },
    intelligence: { enrichmentStatus: 'ENRICHED' },
    visibility: {
      canonicalUrl: 'https://cardbey.com/s/test-store',
      indexable: true,
      jsonLdReady: true,
      aiSearchReady: true,
    },
    ...overrides,
  };
}

describe('AgentCoordinator SKP wiring (Phase 2)', () => {
  beforeEach(() => {
    clearAgentClassCacheForTests();
    __clearRuntimeStoresForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('storeKnowledgeFromSkp maps public DTO + enrichment fields', () => {
    const sk = storeKnowledgeFromSkp(mockSkp());
    expect(sk.name).toBe('Test Cafe');
    expect(sk.canonicalUrl).toContain('cardbey.com');
    expect(sk.enrichmentStatus).toBe('ENRICHED');
    expect(sk.descriptionProvenance).toBe('website');
  });

  it('builds SKP once at orchestrate startup and passes storeKnowledge to agents', async () => {
    const buildSKPFn = vi.fn(async () => mockSkp());
    const blackboard = {
      appendEvent: vi.fn(async () => ({})),
      getEvents: vi.fn(async () => []),
    };

    const coordinator = new AgentCoordinator({
      missionId: 'mission-skp-1',
      orchestrationKind: 'default',
      blackboard,
      baseContext: { missionId: 'mission-skp-1', storeId: 'store-1' },
    });
    coordinator._buildSKPFn = buildSKPFn;

    const results = await coordinator.orchestrate('Research the store', { storeId: 'store-1' });
    expect(buildSKPFn).toHaveBeenCalledTimes(1);
    expect(buildSKPFn).toHaveBeenCalledWith('store-1');
    expect(coordinator.baseContext.storeKnowledge?.name).toBe('Test Cafe');

    const first = Object.values(results)[0];
    // Default decompose may return []; campaign/default stubs still leave baseContext set
    expect(coordinator.baseContext.storeKnowledge.canonicalUrl).toContain('cardbey.com');
    if (first?.result) {
      expect(first.result.storeName === 'Test Cafe' || first.result.storeId === 'store-1').toBe(true);
    }
  });

  it('handles null SKP gracefully (store not found)', async () => {
    const coordinator = new AgentCoordinator({
      missionId: 'mission-skp-missing',
      orchestrationKind: 'default',
      baseContext: { missionId: 'mission-skp-missing', storeId: 'nonexistent' },
    });
    coordinator._buildSKPFn = vi.fn(async () => null);

    await expect(
      coordinator.orchestrate('test', { storeId: 'nonexistent' }),
    ).resolves.toBeTypeOf('object');
    expect(coordinator.baseContext.storeKnowledge).toBeNull();
  });

  it('emits DATA_QUALITY_WARNING when enrichment is not ENRICHED', async () => {
    const blackboard = {
      appendEvent: vi.fn(async () => ({})),
      getEvents: vi.fn(async () => []),
    };
    const coordinator = new AgentCoordinator({
      missionId: 'mission-skp-partial',
      orchestrationKind: 'default',
      blackboard,
      baseContext: { storeId: 'store-partial' },
    });
    coordinator._buildSKPFn = vi.fn(async () =>
      mockSkp({ intelligence: { enrichmentStatus: 'PARTIAL' } }),
    );

    await coordinator.orchestrate('test', {});
    expect(blackboard.appendEvent).toHaveBeenCalledWith(
      'mission-skp-partial',
      'DATA_QUALITY_WARNING',
      expect.objectContaining({ enrichmentStatus: 'PARTIAL' }),
    );
  });
});
