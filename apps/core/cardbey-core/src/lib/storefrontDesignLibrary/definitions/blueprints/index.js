import { TRADE_LEAD_GENERATION_BLUEPRINT } from './tradeLeadGeneration.js';
import { SERVICE_BOOKING_BLUEPRINT } from './serviceBooking.js';
import { RESTAURANT_MENU_BLUEPRINT } from './restaurantMenu.js';
import { RETAIL_COMMERCE_BLUEPRINT } from './retailCommerce.js';
import { PORTFOLIO_SHOWCASE_BLUEPRINT } from './portfolioShowcase.js';

/** @type {import('../../contracts/blueprint.js').StorefrontBlueprint[]} */
export const BLUEPRINT_DEFINITIONS = [
  TRADE_LEAD_GENERATION_BLUEPRINT,
  SERVICE_BOOKING_BLUEPRINT,
  RESTAURANT_MENU_BLUEPRINT,
  RETAIL_COMMERCE_BLUEPRINT,
  PORTFOLIO_SHOWCASE_BLUEPRINT,
];
