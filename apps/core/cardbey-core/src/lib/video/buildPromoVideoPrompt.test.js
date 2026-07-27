import { describe, it, expect } from 'vitest';
import { buildPromoVideoPrompt } from './buildPromoVideoPrompt.js';

describe('buildPromoVideoPrompt', () => {
  it('includes store name, type, products, and user prompt', () => {
    const prompt = buildPromoVideoPrompt({
      userPrompt: 'Create a short promotional video',
      store: {
        name: 'PTH Furniture',
        type: 'furniture',
        location: 'Sydney',
        products: [{ name: 'Leather sofa', description: 'Premium' }],
      },
      tagline: 'Quality you can trust',
    });

    expect(prompt).toContain('PTH Furniture');
    expect(prompt).toContain('furniture');
    expect(prompt).toContain('Leather sofa');
    expect(prompt).toContain('Quality you can trust');
    expect(prompt).toContain('Create a short promotional video');
  });
});
