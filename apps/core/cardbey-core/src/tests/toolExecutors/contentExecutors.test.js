// DANH: skill-round4-content
import { describe, it, expect } from 'vitest';
import { execute as fetchStoreContent } from '../../lib/toolExecutors/content/fetch_store_content.js';
import {
  rewriteProductDescription,
  execute as rewriteContentCopy,
} from '../../lib/toolExecutors/content/rewrite_content_copy.js';
import {
  tagsForProduct,
  storeLevelTags,
  execute as generateSeoTags,
} from '../../lib/toolExecutors/content/generate_seo_tags.js';

describe('content executors', () => {
  it('fetch_store_content returns ok shape', async () => {
    const result = await fetchStoreContent({ storeId: 'store-unknown' });
    expect(result.status).toBe('ok');
    expect(Array.isArray(result.output.products)).toBe(true);
  });

  it('fetch returns honest empty catalog when store missing', async () => {
    const result = await fetchStoreContent({ storeId: 'no-such-store' });
    expect(result.status).toBe('ok');
    expect(result.output.count).toBeGreaterThanOrEqual(0);
  });

  it('fetch does not throw on empty input', async () => {
    await expect(fetchStoreContent({})).resolves.toMatchObject({ status: 'failed' });
  });

  it('rewrite_content_copy caps at 3 products', async () => {
    const products = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      name: `Item ${i}`,
      description: 'Old copy',
    }));
    const result = await rewriteContentCopy({ products, brandTone: 'friendly' });
    expect(result.status).toBe('ok');
    expect(result.output.rewrites.length).toBe(3);
    expect(result.output.truncated).toBe(true);
  });

  it('rewrite generates improved copy', () => {
    const improved = rewriteProductDescription('Latte', 'Coffee drink', 'friendly');
    expect(improved.length).toBeGreaterThan(10);
  });

  it('generate_seo_tags returns product and store tags', async () => {
    expect(tagsForProduct('Espresso', 'cafe').length).toBeGreaterThan(0);
    expect(storeLevelTags('cafe', 'my-cafe').length).toBe(5);
    const result = await generateSeoTags({
      products: [{ id: '1', name: 'Muffin' }],
      businessCategory: 'bakery',
      storeSlug: 'bake-shop',
    });
    expect(result.status).toBe('ok');
    expect(result.output.productTags[0]?.tags.length).toBeGreaterThan(0);
  });
});
