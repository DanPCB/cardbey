/**
 * Storefront layout — products, categories, featured items.
 */

const FEATURED_RE = /^(featured|bestseller|new arrival|top pick)/i;
const CATEGORY_RE = /^(category|collection|department)\s*[:\-.]?\s*(.+)$/i;
const PRODUCT_PRICE_RE = /^(.+?)\s+\$?(\d+(?:\.\d{1,2})?)\s*(?:\|\s*stock:\s*(\d+))?$/i;

export class StorefrontLayout {
  async process(content, options = {}) {
    const store = this._parseStorefront(content.split('\n'));
    const formatted = this._formatStorefront(store, options);

    return {
      processed: formatted,
      stats: {
        products: store.products.length,
        categories: store.categories.length,
        featured: store.featured.length,
      },
      suggestedActions: [
        { id: 'add_product', label: 'Add product' },
        { id: 'feature_item', label: 'Feature item' },
        { id: 'publish_storefront', label: 'Publish storefront' },
      ],
    };
  }

  _parseStorefront(lines) {
    const store = {
      title: '',
      categories: [],
      products: [],
      featured: [],
    };

    let currentCategory = 'General';

    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      const categoryMatch = trimmed.match(CATEGORY_RE);
      if (categoryMatch) {
        currentCategory = categoryMatch[2].trim();
        if (!store.categories.includes(currentCategory)) {
          store.categories.push(currentCategory);
        }
        continue;
      }

      if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !PRODUCT_PRICE_RE.test(trimmed)) {
        currentCategory = trimmed;
        if (!store.categories.includes(currentCategory)) {
          store.categories.push(currentCategory);
        }
        continue;
      }

      const productMatch = trimmed.match(PRODUCT_PRICE_RE);
      if (productMatch) {
        const product = {
          name: productMatch[1].trim(),
          price: productMatch[2],
          stock: productMatch[3] || null,
          category: currentCategory,
          featured: FEATURED_RE.test(trimmed),
        };
        store.products.push(product);
        if (product.featured) {
          store.featured.push(product);
        }
        continue;
      }

      if (!store.title && /shop|store|catalog|inventory/i.test(trimmed)) {
        store.title = trimmed;
      }
    }

    if (store.categories.length === 0 && store.products.length > 0) {
      store.categories.push('General');
    }

    return store;
  }

  _formatStorefront(store, options) {
    const format = options.format || 'markdown';
    if (format === 'json') {
      return JSON.stringify(store, null, 2);
    }

    let result = store.title ? `# ${store.title}\n\n` : '# Storefront\n\n';

    if (store.featured.length) {
      result += '## Featured\n\n';
      for (const item of store.featured) {
        result += `- **${item.name}** — $${item.price}${item.stock ? ` (stock: ${item.stock})` : ''}\n`;
      }
      result += '\n';
    }

    const categories = store.categories.length ? store.categories : ['General'];
    for (const category of categories) {
      const products = store.products.filter((p) => p.category === category);
      if (!products.length) continue;

      result += `## ${category}\n\n`;
      result += '| Product | Price | Stock |\n';
      result += '|---------|-------|-------|\n';
      for (const product of products) {
        result += `| ${product.name} | $${product.price} | ${product.stock ?? '—'} |\n`;
      }
      result += '\n';
    }

    return result.trim();
  }
}

export default StorefrontLayout;
