/**
 * Unit tests for category inference
 */

import { describe, it, expect } from 'vitest';
import { inferMenuCategoryKey, getCategoryDisplayName } from './categoryInference.js';

describe('Category Inference', () => {
  // Test cases
  const testCases = [
    // Coffee items
    { name: 'Espresso', expected: 'coffee' },
    { name: 'Latte', expected: 'coffee' },
    { name: 'Cappuccino', expected: 'coffee' },
    { name: 'Flat White', expected: 'coffee' },
    { name: 'Long Black', expected: 'coffee' },
    { name: 'Americano', expected: 'coffee' },
    { name: 'Macchiato', expected: 'coffee' },
    { name: 'Mocha', expected: 'coffee' },
    { name: 'Piccolo Latte', expected: 'coffee' },
    
    // Beverages
    { name: 'Tea', expected: 'beverages' },
    { name: 'Chai', expected: 'beverages' },
    { name: 'Hot Chocolate', expected: 'beverages' },
    { name: 'Juice', expected: 'beverages' },
    { name: 'Smoothie', expected: 'beverages' },
    
    // Dessert
    { name: 'Cake', expected: 'dessert' },
    { name: 'Muffin', expected: 'dessert' },
    { name: 'Croissant', expected: 'dessert' },
    { name: 'Cookie', expected: 'dessert' },
    { name: 'Brownie', expected: 'dessert' },
    { name: 'Donut', expected: 'dessert' },
    
    // Unknown
    { name: 'Random Item', expected: 'uncategorized' },
    { name: 'XYZ123', expected: 'uncategorized' },
  ];

  testCases.forEach((testCase) => {
    it(`should infer "${testCase.name}" as ${testCase.expected}`, () => {
      const result = inferMenuCategoryKey({ name: testCase.name });
      expect(result.key).toBe(testCase.expected);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Display names', () => {
    it('should return correct display name for coffee', () => {
      expect(getCategoryDisplayName('coffee')).toBeTruthy();
    });

    it('should return correct display name for beverages', () => {
      expect(getCategoryDisplayName('beverages')).toBeTruthy();
    });

    it('should return correct display name for dessert', () => {
      expect(getCategoryDisplayName('dessert')).toBeTruthy();
    });

    it('should return correct display name for uncategorized', () => {
      expect(getCategoryDisplayName('uncategorized')).toBeTruthy();
    });
  });
});
