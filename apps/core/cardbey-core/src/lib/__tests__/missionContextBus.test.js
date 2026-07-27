/**
 * Mission context bus: blackboard-backed prior-step chain (mocked DB via getEvents).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getEventsMock = vi.hoisted(() => vi.fn());

vi.mock('../missionBlackboard.js', () => ({
  appendEvent: vi.fn(),
  getEvents: (...args) => getEventsMock(...args),
}));

import {
  readPriorOutputs,
  buildStepContext,
  MISSION_STEP_OUTPUT_EVENT,
  MAX_PRIOR_CONTEXT_CHARS,
} from '../missionContextBus.js';

function stepEvent(seq, stepIndex, summary) {
  return {
    seq,
    eventType: MISSION_STEP_OUTPUT_EVENT,
    payload: { stepIndex, toolName: 'market_research', stepTitle: null, summary },
  };
}

describe('missionContextBus', () => {
  beforeEach(() => {
    getEventsMock.mockReset();
  });

  describe('readPriorOutputs dedup', () => {
    it('same stepIndex: last row in seq order wins; result length is 1', async () => {
      getEventsMock.mockResolvedValue({
        events: [
          stepEvent(1, 1, 'first-attempt-summary'),
          stepEvent(2, 1, 'retry-wins-summary'),
        ],
      });

      const rows = await readPriorOutputs('mission-1', 2);
      expect(rows).toHaveLength(1);
      expect(rows[0].stepIndex).toBe(1);
      expect(rows[0].summary).toBe('retry-wins-summary');
    });

    it('keeps distinct step indices', async () => {
      getEventsMock.mockResolvedValue({
        events: [stepEvent(1, 1, 'a'), stepEvent(2, 2, 'b')],
      });
      const rows = await readPriorOutputs('m', 3);
      expect(rows.map((r) => r.stepIndex)).toEqual([1, 2]);
    });
  });

  describe('buildStepContext cap', () => {
    it('truncates when over MAX_PRIOR_CONTEXT_CHARS, prefers newline cut, safe to embed in JSON', async () => {
      const chunk = 'word '.repeat(400).trim();
      const events = [];
      for (let s = 1; s <= 25; s += 1) {
        events.push(stepEvent(s, s, `${chunk} step=${s}`));
      }
      getEventsMock.mockResolvedValue({ events });

      const block = await buildStepContext({ missionId: 'm-big', currentStepIndex: 26 });

      expect(block.endsWith('\n…[truncated]')).toBe(true);
      expect(block.length).toBeLessThanOrEqual(MAX_PRIOR_CONTEXT_CHARS + '\n…[truncated]'.length);
      expect(block.length).toBeGreaterThan(5000);

      const rewrapped = JSON.parse(JSON.stringify({ priorStepsContext: block }));
      expect(typeof rewrapped.priorStepsContext).toBe('string');
      expect(rewrapped.priorStepsContext).toBe(block);
    });

    it('summaries may contain JSON text; envelope round-trip still parses (prompt is plain text, not a JSON document)', async () => {
      const jsonLine = JSON.stringify({ id: 1, blob: 'x'.repeat(200) });
      getEventsMock.mockResolvedValue({
        events: [
          stepEvent(1, 1, jsonLine),
          stepEvent(2, 2, jsonLine),
          stepEvent(3, 3, jsonLine),
        ],
      });
      const block = await buildStepContext({ missionId: 'm-json', currentStepIndex: 10 });
      expect(() => JSON.parse(block)).toThrow();
      expect(() => JSON.parse(JSON.stringify({ ctx: block }))).not.toThrow();
    });
  });
});
