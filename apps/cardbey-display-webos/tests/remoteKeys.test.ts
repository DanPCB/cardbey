import { describe, expect, it } from 'vitest';
import { mapKeyToAction } from '../src/platform/remoteKeys.js';

function keyEvent(partial: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return partial as KeyboardEvent;
}

describe('mapKeyToAction', () => {
  it('maps Back / Escape / webOS back keyCode', () => {
    expect(mapKeyToAction(keyEvent({ key: 'Escape' }))).toBe('back');
    expect(mapKeyToAction(keyEvent({ key: 'Backspace' }))).toBe('back');
    expect(mapKeyToAction(keyEvent({ key: 'GoBack', keyCode: 461 } as never))).toBe('back');
  });

  it('maps OK and arrows', () => {
    expect(mapKeyToAction(keyEvent({ key: 'Enter' }))).toBe('ok');
    expect(mapKeyToAction(keyEvent({ key: 'ArrowLeft' }))).toBe('left');
    expect(mapKeyToAction(keyEvent({ key: 'ArrowRight' }))).toBe('right');
  });
});
