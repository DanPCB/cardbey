/**
 * Creator profile / studio audit telemetry (structured logs).
 */

export function logCreatorProfileTelemetry(event, payload = {}) {
  const record = {
    event,
    surface: 'creator_studio',
    timestamp: new Date().toISOString(),
    ...payload,
  };
  console.log('[CREATOR_TELEMETRY]', JSON.stringify(record));
}
