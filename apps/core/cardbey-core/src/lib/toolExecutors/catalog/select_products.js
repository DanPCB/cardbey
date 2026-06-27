/**
 * select_products — list products then pause for user selection (campaign checkpoint).
 */

import { execute as manageProductCatalog } from './manage_product_catalog.js';
import { uiDelegateBlockedResult } from '../uiDelegateBlockedResult.js';
import { resolveCatalogScope } from '../../catalog/catalogScopeResolver.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const scope = resolveCatalogScope(input, context);
  const listResult = await manageProductCatalog(
    {
      ...input,
      storeId: scope.storeId ?? input.storeId,
      action: 'list_products',
      limit: input.limit ?? 50,
    },
    context,
  );

  if (listResult.status === 'failed') {
    return listResult;
  }

  if (listResult.status === 'ok' && listResult.output?.count === 0) {
    return {
      status: 'blocked',
      reason: 'no_products',
      message: 'Add products to your store before selecting campaign targets',
      output: {
        products: [],
        count: 0,
        storeId: scope.storeId,
      },
    };
  }

  return uiDelegateBlockedResult({
    action: 'select_campaign_products',
    message: 'Select products to include in this campaign',
    output: {
      products: listResult.output?.products ?? [],
      count: listResult.output?.count ?? 0,
      storeId: scope.storeId,
    },
  });
}

export default execute;
