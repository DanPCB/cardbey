import { describe, expect, it } from 'vitest';
import {
  normalizeUsername,
  validateCreateCreatorProfileInput,
  validateUsernameFields,
} from '../creatorProfileContract.js';

describe('creatorProfileContract', () => {
  it('requires displayName and username', () => {
    const result = validateCreateCreatorProfileInput({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CREATOR_PROFILE_VALIDATION_FAILED');
      expect(result.error.fields.displayName).toBeTruthy();
      expect(result.error.fields.username).toBeTruthy();
    }
  });

  it('normalizes username to lowercase', () => {
    const result = validateCreateCreatorProfileInput({
      displayName: 'Alex Creator',
      username: 'Alex-Creator',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.username).toBe('alex-creator');
    }
  });

  it('rejects invalid username characters', () => {
    const fields = validateUsernameFields('bad name!');
    expect(fields.username).toBeTruthy();
  });

  it('rejects reserved usernames', () => {
    const fields = validateUsernameFields('admin');
    expect(fields.username).toContain('reserved');
  });

  it('normalizes username helper', () => {
    expect(normalizeUsername('  My_Name  ')).toBe('my_name');
  });
});
