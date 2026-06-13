/**
 * Factory Registry — registers FactoryDefinition instances for Factory Runtime.
 */

import { validateFactoryDefinition } from './factoryDefinition.js';
import {
  CREATIVE_ASSET_FACTORY_V1_ID,
  CREATIVE_ASSET_FACTORY_V2_ID,
  CREATIVE_ASSET_FACTORY_V3_ID,
  CREATIVE_ASSET_FACTORY_V4_ID,
  CAMPAIGN_PACKAGE_FACTORY_V1_ID,
} from './factoryConstants.js';
import { creativeAssetFactoryV1 } from './factories/creativeAssetFactoryV1.js';
import { creativeAssetFactoryV2 } from './factories/creativeAssetFactoryV2.js';
import { creativeAssetFactoryV3 } from './factories/creativeAssetFactoryV3.js';
import { creativeAssetFactoryV4 } from './factories/creativeAssetFactoryV4.js';
import { campaignPackageFactoryV1 } from './factories/campaignPackageFactoryV1.js';
import { bootstrapFactoryRuntime } from './factoryBootstrap.js';

const registry = new Map();

export {
  CREATIVE_ASSET_FACTORY_V1_ID,
  CREATIVE_ASSET_FACTORY_V2_ID,
  CREATIVE_ASSET_FACTORY_V3_ID,
  CREATIVE_ASSET_FACTORY_V4_ID,
  CAMPAIGN_PACKAGE_FACTORY_V1_ID,
};

/**
 * @param {import('./factoryDefinition.js').FactoryDefinitionSchema extends import('zod').ZodType<infer T> ? T : object} definition
 */
export function registerFactory(definition) {
  const validated = validateFactoryDefinition(definition);
  if (!validated.ok) {
    throw new Error(`[factoryRegistry] invalid definition: ${validated.errors.join('; ')}`);
  }
  registry.set(validated.definition.factoryId, validated.definition);
  return validated.definition;
}

/**
 * @param {string} factoryId
 */
export function getFactory(factoryId) {
  const id = typeof factoryId === 'string' ? factoryId.trim() : '';
  return id ? registry.get(id) ?? null : null;
}

export function listFactories() {
  return [...registry.values()];
}

registerFactory(creativeAssetFactoryV1);
registerFactory(creativeAssetFactoryV2);
registerFactory(creativeAssetFactoryV3);
registerFactory(creativeAssetFactoryV4);
registerFactory(campaignPackageFactoryV1);
bootstrapFactoryRuntime();
