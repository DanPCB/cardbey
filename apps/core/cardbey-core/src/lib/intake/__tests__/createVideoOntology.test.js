import { describe, expect, it } from 'vitest';
import {
  isCreativeVideoIntakeTurn,
  isVideoOwnedByCreativeFactory,
  matchesCreateVideoOntology,
} from '../createVideoOntology.js';

describe('createVideoOntology', () => {
  it('matches promotional video creation phrases', () => {
    expect(matchesCreateVideoOntology('Create a promotional video for my store')).toBe(true);
    expect(matchesCreateVideoOntology('create a store')).toBe(false);
  });

  it('treats video tool labels as creative factory ownership', () => {
    expect(isCreativeVideoIntakeTurn('', 'create_video')).toBe(true);
    expect(isVideoOwnedByCreativeFactory('', 'video_plan')).toBe(true);
  });

  it('does not treat incidental video mentions as factory ownership', () => {
    expect(isCreativeVideoIntakeTurn('did the homepage video finish loading?')).toBe(false);
    expect(isVideoOwnedByCreativeFactory('create a store', 'create_store')).toBe(false);
  });
});
