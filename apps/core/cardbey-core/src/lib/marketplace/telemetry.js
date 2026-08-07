const REDACTED_KEYS = new Set([
  'sourceUrl',
  'mediaUrl',
  'originalUrl',
  'originalMediaUrl',
  'evidence',
  'evidenceJson',
  'adminFeedbackJson',
]);

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !REDACTED_KEYS.has(key))
      .map(([key, nested]) => [key, sanitizeValue(nested)]),
  );
}

export function logMarketplaceTelemetry(event, payload = {}) {
  const safePayload = sanitizeValue(payload);
  console.log(
    '[marketplace]',
    JSON.stringify({
      event: String(event || 'unknown'),
      payload: safePayload,
      at: new Date().toISOString(),
    }),
  );
}
