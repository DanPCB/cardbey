/**
 * specify_purpose — capture graphic purpose using current store context.
 */

import { getPrismaClient } from '../../prisma.js';
import { resolveCatalogScope } from '../../catalog/catalogScopeResolver.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const { storeId, draftId } = resolveCatalogScope(input, context);
  const purpose = String(input.purpose ?? input.text ?? context.intentText ?? '').trim();
  const prisma = getPrismaClient();

  let storeName = null;
  let storeType = null;

  if (storeId) {
    const business = await prisma.business.findUnique({
      where: { id: storeId },
      select: { name: true, type: true, brandTone: true, brandStyle: true },
    });
    if (business) {
      storeName = business.name;
      storeType = business.type;
    }
  }

  return {
    status: 'ok',
    output: {
      purpose: purpose || 'promotion',
      storeId,
      draftId,
      storeName,
      storeType,
      readyForGraphic: Boolean(storeId || draftId),
      message: purpose
        ? `Graphic purpose captured: ${purpose}`
        : 'Graphic purpose defaulted to promotion',
    },
  };
}

export default execute;
