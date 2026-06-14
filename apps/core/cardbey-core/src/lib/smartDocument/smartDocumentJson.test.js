import { describe, expect, it } from 'vitest';
import {
  parseSmartDocumentJsonField,
  serializeSmartDocumentJsonField,
} from './smartDocumentJson.js';

describe('smartDocumentJson', () => {
  it('serializes objects for String columns', () => {
    const out = serializeSmartDocumentJsonField({ template: 'loyalty', theme: 'warm' });
    expect(typeof out).toBe('string');
    expect(JSON.parse(out)).toEqual({ template: 'loyalty', theme: 'warm' });
  });

  it('parses stored JSON strings', () => {
    expect(parseSmartDocumentJsonField('{"a":1}')).toEqual({ a: 1 });
    expect(parseSmartDocumentJsonField({ b: 2 })).toEqual({ b: 2 });
  });
});
