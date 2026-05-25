import { describe, expect, it } from 'vitest';
import { classifyStoreWebsiteCreateIntent } from '../storeWebsiteRunwayClassifier.js';

describe('storeWebsiteRunwayClassifier', () => {
  it('routes website phrases to website runway', () => {
    for (const msg of [
      'create website',
      'Create my website',
      'create a mini website',
      'build a landing page for my cafe',
      'create a campaign page for summer sale',
      'build a website for my store',
    ]) {
      const r = classifyStoreWebsiteCreateIntent(msg);
      expect(r.ambiguous, msg).toBe(false);
      expect(r.intentMode, msg).toBe('website');
    }
  });

  it('routes store phrases to store runway', () => {
    for (const msg of [
      'create a store',
      'create store for PTH International',
      'open store in Melbourne',
      'build an online store',
      'product catalog for my shop',
      'new storefront for retail',
    ]) {
      const r = classifyStoreWebsiteCreateIntent(msg);
      expect(r.ambiguous, msg).toBe(false);
      expect(r.intentMode, msg).toBe('store');
    }
  });

  it('prefers website runway for "website for my store" phrasing', () => {
    const r = classifyStoreWebsiteCreateIntent('build a website for my store');
    expect(r.ambiguous).toBe(false);
    expect(r.intentMode).toBe('website');
  });

  it('flags ambiguous when store and website signals both match', () => {
    const r = classifyStoreWebsiteCreateIntent('create a store and a mini website');
    expect(r.ambiguous).toBe(true);
    expect(r.intentMode).toBeNull();
  });

  it('returns null intent when message has no create runway signals', () => {
    const r = classifyStoreWebsiteCreateIntent('hello there');
    expect(r.intentMode).toBeNull();
    expect(r.ambiguous).toBe(false);
  });
});
