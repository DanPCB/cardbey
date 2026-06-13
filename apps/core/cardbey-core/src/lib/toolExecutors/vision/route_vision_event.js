/**
 * route_vision_event — dispatch classified vision events to downstream skills/actions.
 */

import { routeVisionEvent } from '../../vision/visionRouter.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const event = input.event ?? null;
  if (!event || typeof event !== 'object') {
    return {
      status: 'failed',
      error: { message: 'event is required' },
      output: { action: 'unsupported', message: 'Missing vision event.' },
    };
  }

  const route = await routeVisionEvent(event, {
    userId: context.userId ?? input.userId ?? event.userId ?? null,
    storeIdHint: input.storeIdHint ?? context.storeId ?? event.storeIdHint ?? null,
    missionId: input.missionId ?? context.missionId ?? null,
  });

  return {
    status: 'ok',
    output: route,
  };
}
