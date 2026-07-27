/**
 * Creator content lifecycle telemetry (studio + runtime tools).
 */

/**
 * @param {string} event
 * @param {Record<string, unknown>} payload
 */
export function logCreatorContentTelemetry(event, payload = {}) {
  const record = {
    event,
    source: payload.source ?? 'creator_studio',
    timestamp: new Date().toISOString(),
    ...payload,
  };
  if (process.env.NODE_ENV !== 'test') {
    console.info('[creator-content]', JSON.stringify(record));
  }
  return record;
}

export default { logCreatorContentTelemetry };
