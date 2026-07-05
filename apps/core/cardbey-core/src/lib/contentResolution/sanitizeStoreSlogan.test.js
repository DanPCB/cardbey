import { describe, expect, it } from 'vitest';
import { sanitizeStoreSlogan } from './sanitizeStoreSlogan.js';

describe('sanitizeStoreSlogan', () => {
  it('strips slogan tips and returns the first numbered sample only', () => {
    expect(
      sanitizeStoreSlogan(
        'Here are some professional slogans for your Food & drink business: 1. **"Where every bite tells a story"** 2. "Fresh flavors daily"',
      ),
    ).toBe('Where every bite tells a story');
  });
});
