/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RagIntegration } from '../ragIntegration.js';

vi.mock('../../../services/ragService.js', () => ({
  buildRagContext: vi.fn(),
}));

import { buildRagContext } from '../../../services/ragService.js';

describe('RagIntegration', () => {
  /** @type {Record<string, string | undefined>} */
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  it('shouldUseRag returns false when feature flag is off', () => {
    process.env.ENABLE_RAG_IN_REASONER = 'false';
    const rag = new RagIntegration();
    expect(rag.shouldUseRag({ text: 'What are my sales?' }, {})).toBe(false);
  });

  it('shouldUseRag skips greetings', () => {
    process.env.ENABLE_RAG_IN_REASONER = 'true';
    const rag = new RagIntegration();
    expect(rag.shouldUseRag({ text: 'hello' }, {})).toBe(false);
  });

  it('shouldUseRag enables for analytics questions', () => {
    process.env.ENABLE_RAG_IN_REASONER = 'true';
    const rag = new RagIntegration();
    expect(rag.shouldUseRag({ text: 'What are my sales this week?' }, {})).toBe(true);
  });

  it('shouldUseRag skips imperative store creation', () => {
    process.env.ENABLE_RAG_IN_REASONER = 'true';
    const rag = new RagIntegration();
    expect(rag.shouldUseRag({ text: 'help me create a store called Test' }, {})).toBe(false);
    expect(rag.shouldUseRag({ text: 'Create a campaign' }, {})).toBe(false);
    expect(rag.shouldUseRag({ text: 'Set up a loyalty program' }, {})).toBe(false);
  });

  it('shouldUseRag enables for informational analytics requests', () => {
    process.env.ENABLE_RAG_IN_REASONER = 'true';
    const rag = new RagIntegration();
    expect(rag.shouldUseRag({ text: 'What are my sales trends?' }, {})).toBe(true);
    expect(rag.shouldUseRag({ text: 'Show me analytics' }, {})).toBe(true);
    expect(rag.shouldUseRag({ text: 'How is my store performing?' }, {})).toBe(true);
  });

  it('fetchRagContext returns normalized chunks with tenant filter', async () => {
    process.env.ENABLE_RAG_IN_REASONER = 'true';
    process.env.RAG_MAX_CHUNKS = '5';
    process.env.RAG_MIN_SCORE = '0.5';
    process.env.RAG_TIMEOUT_MS = '5000';

    buildRagContext.mockResolvedValue({
      chunks: [
        {
          id: 'c1',
          content: 'Sales increased 12% last week.',
          similarity: 0.82,
          sourcePath: 'reports/weekly.md',
          scope: 'tenant_activity',
          chunkIndex: 0,
        },
        {
          id: 'c2',
          content: 'Low relevance noise.',
          similarity: 0.2,
          sourcePath: 'other.md',
          scope: 'general',
          chunkIndex: 1,
        },
      ],
      context: '',
      sources: [],
    });

    const telemetry = { track: vi.fn() };
    const rag = new RagIntegration({ telemetry });
    const result = await rag.fetchRagContext('user_1', 'session_1', 'What are my sales?', {
      tenantKey: 'tenant_abc',
    });

    expect(buildRagContext).toHaveBeenCalledWith('What are my sales?', undefined, 'tenant_abc');
    expect(result?.chunks).toHaveLength(1);
    expect(result?.chunks[0].score).toBe(0.82);
    expect(telemetry.track).toHaveBeenCalledWith(
      'rag.retrieved',
      expect.objectContaining({ chunkCount: 1, userId: 'user_1' }),
    );
  });

  it('fetchRagContext returns null on failure without throwing', async () => {
    process.env.ENABLE_RAG_IN_REASONER = 'true';
    buildRagContext.mockRejectedValue(new Error('OPENAI_NOT_CONFIGURED'));

    const telemetry = { track: vi.fn() };
    const rag = new RagIntegration({ telemetry });
    const result = await rag.fetchRagContext('user_1', 'session_1', 'campaign performance', {});

    expect(result).toBeNull();
    expect(telemetry.track).toHaveBeenCalledWith(
      'rag.error',
      expect.objectContaining({ error: 'OPENAI_NOT_CONFIGURED' }),
    );
  });

  it('formatRagContext builds readable appendix', () => {
    const rag = new RagIntegration();
    const formatted = rag.formatRagContext({
      chunks: [
        {
          content: 'Revenue was $10k.',
          score: 0.75,
          source: 'reports/weekly.md',
          metadata: { source: 'reports/weekly.md' },
        },
      ],
    });

    expect(formatted).toContain('Relevant context from your store');
    expect(formatted).toContain('reports/weekly.md');
    expect(formatted).toContain('Revenue was $10k.');
  });

  it('getRagSummary summarizes chunk metadata', () => {
    const rag = new RagIntegration();
    expect(rag.getRagSummary(null)).toEqual({
      hasRag: false,
      chunkCount: 0,
      sources: [],
      topScore: 0,
    });

    const summary = rag.getRagSummary({
      chunks: [{ score: 0.9, source: 'a.md', metadata: { source: 'a.md' } }],
    });
    expect(summary.hasRag).toBe(true);
    expect(summary.chunkCount).toBe(1);
    expect(summary.sources).toEqual(['a.md']);
    expect(summary.topScore).toBe(0.9);
  });
});
