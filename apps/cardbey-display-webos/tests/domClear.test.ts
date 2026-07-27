import { describe, expect, it } from 'vitest';
import { clearElementChildren } from '../src/playback/domClear.js';

describe('clearElementChildren chrome68', () => {
  it('removes all children without replaceChildren', () => {
    const kids: { remove: () => void }[] = [];
    const host = {
      get firstChild() {
        return kids[0] || null;
      },
      removeChild(child: { remove: () => void }) {
        const idx = kids.indexOf(child);
        if (idx >= 0) kids.splice(idx, 1);
        return child;
      },
      append(child: { remove: () => void }) {
        kids.push(child);
      },
    };
    host.append({ remove() {} });
    host.append({ remove() {} });
    expect(kids.length).toBe(2);
    clearElementChildren(host as unknown as Element);
    expect(kids.length).toBe(0);
  });
});
