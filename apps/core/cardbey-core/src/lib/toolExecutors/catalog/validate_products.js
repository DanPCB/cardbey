/**
 * validate_products — validate product rows after catalog upload checkpoint.
 */

import { getPrismaClient } from '../../prisma.js';
import { getCatalogSummary, listProducts } from '../../catalog/productCatalogService.js';
import { countDraftPreviewItems, resolveCatalogScope } from '../../catalog/catalogScopeResolver.js';

/**
 * @param {unknown} items
 * @returns {{ valid: boolean; issues: string[]; count: number }}
 */
export function validateDraftProductRows(items) {
  const rows = Array.isArray(items) ? items : [];
  const issues = [];

  if (rows.length === 0) {
    issues.push('No products found in draft catalog');
  }

  for (const [index, row] of rows.entries()) {
    const item = row && typeof row === 'object' ? row : {};
    const name = String(item.name ?? item.title ?? '').trim();
    if (!name) {
      issues.push(`Product ${index + 1} is missing a name`);
    }
  }

  return { valid: issues.length === 0, issues, count: rows.length };
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const { storeId, draftId } = resolveCatalogScope(input, context);
  const prisma = getPrismaClient();

  try {
    if (storeId) {
      const summary = await getCatalogSummary(prisma, storeId);
      if (summary.total < 1) {
        return {
          status: 'blocked',
          reason: 'no_products',
          message: 'Upload products before validation',
          output: { valid: false, productCount: 0, issues: ['No products in store catalog'] },
        };
      }

      const products = await listProducts(prisma, storeId, { limit: 25 });
      const issues = [];
      for (const product of products) {
        if (!String(product.name ?? '').trim()) {
          issues.push(`Product ${product.id} is missing a name`);
        }
      }

      return {
        status: issues.length ? 'blocked' : 'ok',
        ...(issues.length
          ? { reason: 'invalid_products', message: 'Some products failed validation' }
          : {}),
        output: {
          valid: issues.length === 0,
          productCount: summary.total,
          issues,
          storeId,
          status: issues.length === 0 ? 'validated' : 'invalid',
        },
      };
    }

    if (draftId) {
      const draft = await prisma.draftStore.findUnique({
        where: { id: draftId },
        select: { id: true, preview: true },
      });

      if (!draft) {
        return {
          status: 'failed',
          error: { code: 'NOT_FOUND', message: `Draft store not found: ${draftId}` },
          output: { valid: false, status: 'failed' },
        };
      }

      const preview =
        draft.preview && typeof draft.preview === 'object' && !Array.isArray(draft.preview)
          ? draft.preview
          : {};
      const items = Array.isArray(preview.items)
        ? preview.items
        : Array.isArray(preview.catalog?.products)
          ? preview.catalog.products
          : [];
      const result = validateDraftProductRows(items);

      return {
        status: result.valid ? 'ok' : 'blocked',
        ...(result.valid ? {} : { reason: 'invalid_products', message: 'Product data needs attention' }),
        output: {
          valid: result.valid,
          productCount: result.count,
          issues: result.issues,
          draftId,
          status: result.valid ? 'validated' : 'invalid',
        },
      };
    }

    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'No store context found' },
      output: { valid: false, status: 'failed' },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: { message: err?.message ?? String(err) },
      output: { valid: false, status: 'failed' },
    };
  }
}

export default execute;
