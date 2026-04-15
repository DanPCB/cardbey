/**
 * missionContextBus.test.js — Vitest (co-located with missionContextBus.js)
 *
 * Run: npx vitest run src/lib/missionContextBus.test.js
 */

import { vi, describe, test, expect, beforeEach, beforeAll } from 'vitest';

// ── Mocks declared at module scope so vi.mock hoisting captures them ──────────
const mockAppendEvent = vi.fn().mockResolvedValue({ ok: true });
const mockGetEvents   = vi.fn();

vi.mock('./missionBlackboard.js', () => ({
  appendEvent: mockAppendEvent,
  getEvents:   mockGetEvents,
}));

// ── Deferred import: wait until after vi.mock hoisting settles ────────────────
let summarizeStepOutputForBus;
let writeStepOutput;
let readPriorOutputs;
let buildStepContext;
let shouldPersistStepOutputToBus;
let MISSION_STEP_OUTPUT_EVENT;
let MAX_PRIOR_CONTEXT_CHARS;

beforeAll(async () => {
  const bus = await import('./missionContextBus.js');
  summarizeStepOutputForBus  = bus.summarizeStepOutputForBus;
  writeStepOutput            = bus.writeStepOutput;
  readPriorOutputs           = bus.readPriorOutputs;
  buildStepContext           = bus.buildStepContext;
  shouldPersistStepOutputToBus = bus.shouldPersistStepOutputToBus;
  MISSION_STEP_OUTPUT_EVENT  = bus.MISSION_STEP_OUTPUT_EVENT;
  MAX_PRIOR_CONTEXT_CHARS    = bus.MAX_PRIOR_CONTEXT_CHARS;
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeEvent(stepIndex, toolName, summary, seq = stepIndex) {
  return {
    seq,
    eventType: MISSION_STEP_OUTPUT_EVENT,
    payload: { stepIndex, toolName, summary, stepTitle: null, output: {} },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply default resolved value after clearAllMocks resets it
  mockAppendEvent.mockResolvedValue({ ok: true });
});

// =============================================================================
// summarizeStepOutputForBus
// =============================================================================
describe('summarizeStepOutputForBus', () => {
  test('market_research — extracts summary + audience + recommendations', () => {
    const out = {
      marketReport: {
        summary: 'Fashion shoppers',
        targetAudience: 'Women 25-40',
        recommendations: ['rec1', 'rec2', 'rec3'],
      },
    };
    const result = summarizeStepOutputForBus('market_research', out);
    expect(result).toContain('Fashion shoppers');
    expect(result).toContain('Audience: Women 25-40');
    expect(result).toContain('rec1');
  });

  test('market_research — falls back to JSON when marketReport is empty', () => {
    const result = summarizeStepOutputForBus('market_research', { marketReport: {} });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('create_promotion — extracts phase + message + recommendation count', () => {
    const out = { phase: 'draft', message: 'Promotion ready', recommendations: [1, 2, 3] };
    const result = summarizeStepOutputForBus('create_promotion', out);
    expect(result).toContain('phase=draft');
    expect(result).toContain('message=Promotion ready');
    expect(result).toContain('recommendations=3');
  });

  test('launch_campaign — extracts headline', () => {
    const result = summarizeStepOutputForBus('launch_campaign', {
      headline: 'Big Sale',
      message:  'Live now',
    });
    expect(result).toContain('headline=Big Sale');
    expect(result).toContain('Live now');
  });

  test('unknown tool — returns JSON-ish string without throwing', () => {
    const result = summarizeStepOutputForBus('some_future_tool', { foo: 'bar' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('caps output at MAX_SUMMARY_CHARS (2000)', () => {
    const out = { marketReport: { summary: 'x'.repeat(5000) } };
    const result = summarizeStepOutputForBus('market_research', out);
    expect(result.length).toBeLessThanOrEqual(2000);
  });

  test('handles null gracefully', () => {
    expect(() => summarizeStepOutputForBus('market_research', null)).not.toThrow();
  });

  test('handles non-object (string) gracefully', () => {
    expect(() => summarizeStepOutputForBus('market_research', 'just a string')).not.toThrow();
  });
});

// =============================================================================
// readPriorOutputs — dedup (last-wins per stepIndex)
// =============================================================================
describe('readPriorOutputs — dedup', () => {
  test('two events with the same stepIndex collapse to the last one (highest seq)', async () => {
    mockGetEvents.mockResolvedValue({
      events: [
        makeEvent(1, 'market_research', 'original summary', 1),
        makeEvent(1, 'market_research', 'retry summary',    5),
      ],
    });

    const result = await readPriorOutputs('mission-abc', 2);

    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe('retry summary');
  });

  test('events for different stepIndexes are all returned, sorted ascending', async () => {
    mockGetEvents.mockResolvedValue({
      events: [
        makeEvent(2, 'create_promotion', 'promo summary',  2),
        makeEvent(1, 'market_research',  'market summary', 1),
      ],
    });

    const result = await readPriorOutputs('mission-abc', 3);

    expect(result).toHaveLength(2);
    expect(result[0].stepIndex).toBe(1);
    expect(result[1].stepIndex).toBe(2);
  });

  test('excludes events at or above currentStepIndex', async () => {
    mockGetEvents.mockResolvedValue({
      events: [
        makeEvent(1, 'market_research', 'ok',                 1),
        makeEvent(3, 'launch_campaign', 'should be excluded', 3),
      ],
    });

    const result = await readPriorOutputs('mission-abc', 3);

    expect(result).toHaveLength(1);
    expect(result[0].stepIndex).toBe(1);
  });

  test('returns empty array when currentStepIndex <= 1', async () => {
    const result = await readPriorOutputs('mission-abc', 1);
    expect(result).toEqual([]);
    expect(mockGetEvents).not.toHaveBeenCalled();
  });

  test('ignores non-step_output event types', async () => {
    mockGetEvents.mockResolvedValue({
      events: [
        { seq: 1, eventType: 'mission_started', payload: { stepIndex: 1 } },
        makeEvent(1, 'market_research', 'real output', 2),
      ],
    });

    const result = await readPriorOutputs('mission-abc', 2);
    expect(result).toHaveLength(1);
  });
});

// =============================================================================
// buildStepContext — 12k char cap
// =============================================================================
describe('buildStepContext — cap', () => {
  test('returns empty string when currentStepIndex <= 1', async () => {
    const result = await buildStepContext({ missionId: 'x', currentStepIndex: 1 });
    expect(result).toBe('');
    expect(mockGetEvents).not.toHaveBeenCalled();
  });

  test('returns empty string when no prior outputs exist', async () => {
    mockGetEvents.mockResolvedValue({ events: [] });
    const result = await buildStepContext({ missionId: 'x', currentStepIndex: 2 });
    expect(result).toBe('');
  });

  test('truncates when over MAX_PRIOR_CONTEXT_CHARS, prefers newline cut, safe to embed in JSON', async () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      makeEvent(i + 1, 'market_research', 'A'.repeat(1000), i + 1)
    );
    mockGetEvents.mockResolvedValue({ events });

    const result = await buildStepContext({ missionId: 'x', currentStepIndex: 21 });

    expect(result.length).toBeLessThanOrEqual(MAX_PRIOR_CONTEXT_CHARS + 20);
    expect(result).toContain('[truncated]');
    expect(result.indexOf('Step 1')).toBeGreaterThanOrEqual(0);
  });

  test('summaries may contain JSON text; envelope round-trip still parses (prompt is plain text, not a JSON document)', async () => {
    mockGetEvents.mockResolvedValue({
      events: [makeEvent(1, 'market_research', '{"key":"value","nested":{"a":1}}', 1)],
    });

    const result = await buildStepContext({ missionId: 'x', currentStepIndex: 2 });

    expect(() => JSON.stringify({ systemPrompt: result })).not.toThrow();
    expect(result).toContain('key');
  });

  test('normal output (under cap) returned fully without truncation marker', async () => {
    mockGetEvents.mockResolvedValue({
      events: [makeEvent(1, 'market_research', 'short summary', 1)],
    });

    const result = await buildStepContext({ missionId: 'x', currentStepIndex: 2 });

    expect(result).toContain('short summary');
    expect(result).not.toContain('[truncated]');
    expect(result.length).toBeLessThan(MAX_PRIOR_CONTEXT_CHARS);
  });
});

// =============================================================================
// writeStepOutput — validation + appendEvent call shape
// =============================================================================
describe('writeStepOutput', () => {
  test('calls appendEvent with correct eventType and payload shape', async () => {
    await writeStepOutput(
      'mission-1',
      { stepIndex: 1, toolName: 'market_research' },
      { marketReport: { summary: 'test' } }
    );

    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    const [mid, eventType, payload] = mockAppendEvent.mock.calls[0];
    expect(mid).toBe('mission-1');
    expect(eventType).toBe(MISSION_STEP_OUTPUT_EVENT);
    expect(payload.stepIndex).toBe(1);
    expect(payload.toolName).toBe('market_research');
    expect(typeof payload.summary).toBe('string');
    expect(typeof payload.completedAt).toBe('string');
  });

  test('returns { ok: false } for missing missionId', async () => {
    const result = await writeStepOutput('', { stepIndex: 1, toolName: 'market_research' }, {});
    expect(result.ok).toBe(false);
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  test('returns { ok: false } for stepIndex < 1', async () => {
    const result = await writeStepOutput('mission-1', { stepIndex: 0, toolName: 'market_research' }, {});
    expect(result.ok).toBe(false);
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  test('returns { ok: false } for missing toolName', async () => {
    const result = await writeStepOutput('mission-1', { stepIndex: 1, toolName: '' }, {});
    expect(result.ok).toBe(false);
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  test('strips imageDataUrl keys from payload', async () => {
    await writeStepOutput(
      'mission-1',
      { stepIndex: 1, toolName: 'create_promotion' },
      { imageDataUrl: 'data:image/png;base64,abc123', message: 'ok' }
    );

    const payload = mockAppendEvent.mock.calls[0][2];
    const outputStr = JSON.stringify(payload.output);
    expect(outputStr).not.toContain('data:image');
    expect(outputStr).toContain('ok');
  });

  test('strips ownerProvidedProductImageDataUrl', async () => {
    await writeStepOutput(
      'mission-1',
      { stepIndex: 1, toolName: 'create_promotion' },
      { ownerProvidedProductImageDataUrl: 'data:image/jpeg;base64,xyz', title: 'promo' }
    );

    const payload = mockAppendEvent.mock.calls[0][2];
    const outputStr = JSON.stringify(payload.output);
    expect(outputStr).not.toContain('data:image');
    expect(outputStr).toContain('promo');
  });

  test('handles non-object rawOutput by wrapping in { value }', async () => {
    await expect(
      writeStepOutput('mission-1', { stepIndex: 1, toolName: 'market_research' }, 'plain string')
    ).resolves.toMatchObject({ ok: true });

    const payload = mockAppendEvent.mock.calls[0][2];
    expect(payload.output).toMatchObject({ value: 'plain string' });
  });
});

// =============================================================================
// shouldPersistStepOutputToBus
// =============================================================================
describe('shouldPersistStepOutputToBus', () => {
  test.each([
    ['market_research',    true],
    ['create_promotion',   true],
    ['launch_campaign',    true],
    ['smart_visual',       true],
    ['generate_slideshow', false],
    ['general_chat',       false],
    ['connect_social_account', false],
    ['GENERATE_SLIDESHOW', false],
    ['General_Chat',       false],
    ['',                   false],
  ])('tool=%s → %s', (tool, expected) => {
    expect(shouldPersistStepOutputToBus(tool)).toBe(expected);
  });
});
