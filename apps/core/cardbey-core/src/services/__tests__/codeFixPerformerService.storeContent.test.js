import { describe, expect, it } from 'vitest';
import { tryBuildStoreContentFixOutputFromIntakePatch } from '../storeContentFixFromIntakePatch.js';
import { detectStoreContentFix } from '../storeContentFixDetect.js';

describe('detectStoreContentFix', () => {
  it('extracts newValue MIMI WEB from unquoted "fix the headline to MIMI WEB"', () => {
    const r = detectStoreContentFix('fix the headline to MIMI WEB', []);
    expect(r.isContentFix).toBe(true);
    expect(r.newValue).toBe('MIMI WEB');
    expect(r.oldValue).toBe('');
    expect(r.field).toBe('heroTitle');
  });

  it('extracts newValue from quoted tail', () => {
    const r = detectStoreContentFix("fix the headline to 'MIMI WEB'", []);
    expect(r.newValue).toBe('MIMI WEB');
    expect(r.oldValue).toBe('');
  });

  it('keeps real old value in replace X with Y', () => {
    const r = detectStoreContentFix('replace "Old Brand" with "New Brand" on the hero', []);
    expect(r.newValue).toBe('New Brand');
    expect(r.oldValue).toBe('Old Brand');
  });
});

describe('tryBuildStoreContentFixOutputFromIntakePatch', () => {
  it('builds awaiting_approval output from valid storeContentPatch', () => {
    const r = tryBuildStoreContentFixOutputFromIntakePatch({
      storeContentPatch: {
        kind: 'store_content_patch',
        version: 1,
        targetField: 'heroTitle',
        newText: 'Hello',
      },
      description: 'user asked',
    });
    expect(r).not.toBeNull();
    expect(r.ok).toBe(true);
    expect(r.output.isStoreContentFix).toBe(true);
    expect(r.output.storeContentPatch).toMatchObject({ targetField: 'heroTitle', newText: 'Hello' });
    expect(r.output.proposedPatch).toMatchObject({
      filePath: 'store:heroTitle',
      newStr: 'Hello',
      oldStr: '',
    });
  });

  it('returns null when patch is invalid', () => {
    expect(
      tryBuildStoreContentFixOutputFromIntakePatch({ storeContentPatch: {}, description: 'x' }),
    ).toBeNull();
  });
});
