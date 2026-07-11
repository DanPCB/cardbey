import { describe, expect, it } from 'vitest';
import {
  isAmbiguousPerformerTurn,
  isGeneralPerformerChatTurn,
  isOpenPerformerChatTurn,
} from '../intakeCasualChatTurn.js';

describe('intakeCasualChatTurn', () => {
  it('treats gibberish as ambiguous open chat', () => {
    expect(isAmbiguousPerformerTurn('sdfad')).toBe(true);
    expect(isAmbiguousPerformerTurn('asdfjkl')).toBe(true);
    expect(isOpenPerformerChatTurn('sdfad')).toBe(true);
  });

  it('does not treat store-scoped intents as ambiguous', () => {
    expect(isAmbiguousPerformerTurn('add product')).toBe(false);
    expect(isAmbiguousPerformerTurn('create campaign')).toBe(false);
    expect(isOpenPerformerChatTurn('add product')).toBe(false);
  });

  it('keeps greetings and help on general chat path', () => {
    expect(isGeneralPerformerChatTurn('hi')).toBe(true);
    expect(isGeneralPerformerChatTurn('I need help')).toBe(true);
    expect(isOpenPerformerChatTurn('I need help')).toBe(true);
  });
});
