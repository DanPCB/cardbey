import { SERVICES_BLUEPRINTS } from './servicesBlueprints.js';
import { AUTO_BLUEPRINTS } from './autoBlueprints.js';
import { BEAUTY_BLUEPRINTS } from './beautyBlueprints.js';
import { FASHION_BLUEPRINTS } from './fashionBlueprints.js';
import { RETAIL_BLUEPRINTS } from './retailBlueprints.js';
import { PROFESSIONAL_BLUEPRINTS } from './professionalBlueprints.js';
import { FOOD_BLUEPRINTS } from './foodBlueprints.js';

/** @type {Record<string, import('../industryBlueprintRegistry.js').IndustryBlueprint>} */
export const ALL_INDUSTRY_BLUEPRINTS = {
  ...FOOD_BLUEPRINTS,
  ...SERVICES_BLUEPRINTS,
  ...AUTO_BLUEPRINTS,
  ...BEAUTY_BLUEPRINTS,
  ...FASHION_BLUEPRINTS,
  ...RETAIL_BLUEPRINTS,
  ...PROFESSIONAL_BLUEPRINTS,
};
