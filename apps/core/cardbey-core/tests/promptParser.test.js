import { describe, expect, it } from 'vitest';
import { parsePromotionPrompt } from '../src/services/promptParser.js';

describe('parsePromotionPrompt', () => {
  it('extracts product, discount, duration and screen', () => {
    const result = parsePromotionPrompt(
      'Tạo khuyến mãi cho bánh mì phô mai giảm 20% trong 2 phút, hiển thị trên Bakery#1'
    );
    expect(result.productName.toLowerCase()).toContain('bánh mì phô mai');
    expect(result.discountPct).toBe(20);
    expect(result.durationSec).toBe(120);
    expect(result.screens).toEqual(['Bakery#1']);
  });

  it('falls back to defaults when prompt lacks hints', () => {
    const result = parsePromotionPrompt('Promo generic');
    expect(result.productName).toBe('Sản phẩm');
    expect(result.discountPct).toBe(10);
    expect(result.durationSec).toBe(120);
    expect(result.screens).toEqual(['Bakery#1']);
  });
});

