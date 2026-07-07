/**
 * Runtime profile — capability-driven flags for booking, quote, ordering, etc.
 * Runtime asks "Can this business quote?" not "Is this a tiler?"
 */

import { hasCapability } from './BusinessCapabilityResolver.js';

/** @param {import('./types.js').BusinessCapabilities} capabilities */
export function resolveRuntimeProfile(capabilities) {
  return {
    bookingEnabled: hasCapability(capabilities, 'booking'),
    quotationEnabled: hasCapability(capabilities, 'quotation'),
    orderingEnabled: hasCapability(capabilities, 'ordering') || hasCapability(capabilities, 'menu'),
    inventoryEnabled: hasCapability(capabilities, 'inventory'),
    projectsEnabled: hasCapability(capabilities, 'projects'),
    appointmentsEnabled:
      hasCapability(capabilities, 'appointments') || hasCapability(capabilities, 'inspection_booking'),
    calendarEnabled: hasCapability(capabilities, 'calendar'),
    membershipsEnabled: hasCapability(capabilities, 'memberships'),
    deliveryEnabled: hasCapability(capabilities, 'delivery'),
  };
}

/** @param {import('./types.js').BusinessRuntimeProfile} runtime @param {string} capability */
export function isRuntimeCapabilityEnabled(runtime, capability) {
  const map = {
    booking: 'bookingEnabled',
    quotation: 'quotationEnabled',
    quote: 'quotationEnabled',
    ordering: 'orderingEnabled',
    inventory: 'inventoryEnabled',
    projects: 'projectsEnabled',
    appointments: 'appointmentsEnabled',
    calendar: 'calendarEnabled',
    memberships: 'membershipsEnabled',
    delivery: 'deliveryEnabled',
  };
  const key = map[capability] ?? capability;
  return runtime?.[key] === true;
}
