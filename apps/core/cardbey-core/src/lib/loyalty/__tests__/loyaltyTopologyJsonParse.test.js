/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { safeParseTopologyJson, stripLlmJsonFence } from '../loyaltyTopologyJsonParse.js';

describe('loyaltyTopologyJsonParse', () => {
  it('strips markdown fences', () => {
    expect(stripLlmJsonFence('```json\n{"rows":4}\n```')).toBe('{"rows":4}');
  });

  it('parses valid JSON', () => {
    const parsed = safeParseTopologyJson('{"rows":4,"columns":6,"cells":[]}');
    expect(parsed?.rows).toBe(4);
    expect(parsed?.columns).toBe(6);
  });

  it('repairs trailing commas', () => {
    const parsed = safeParseTopologyJson('{"rows":4,"columns":6,"cells":[],}');
    expect(parsed?.rows).toBe(4);
  });

  it('falls back to regex extraction when JSON is invalid', () => {
    const parsed = safeParseTopologyJson('Here is topology { rows: 4, columns: 6, broken');
    expect(parsed?.rows).toBe(4);
    expect(parsed?.columns).toBe(6);
  });

  it('falls back to OCR parser when snippet fails', () => {
    const ocrText = 'Coffee Coffee Coffee Coffee Coffee Coffee Coffee Free\nCoffee Coffee Coffee Coffee Coffee Coffee Coffee Free';
    const parsed = safeParseTopologyJson('not json at all', { ocrText });
    expect(parsed?.rows).toBeGreaterThan(0);
    expect(parsed?.columns).toBeGreaterThan(0);
  });
});
