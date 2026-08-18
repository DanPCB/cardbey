/**
 * Redact Cloudflare Stream secrets and capability URLs from strings/objects.
 * RTMPS stream keys and WHIP publish URLs are durable bearer credentials — never log them.
 */

const WHIP_HINT = /webRTC\/publish|\/whip\b/i;
const WHEP_HINT = /webRTC\/play|\/whep\b/i;
const RTMPS_HINT = /^rtmps:\/\//i;

/**
 * @param {string} value
 * @returns {string}
 */
export function redactCloudflareCapabilityUrl(value) {
  const s = String(value || '');
  if (!s) return s;
  if (RTMPS_HINT.test(s) || /live\.cloudflare\.com/i.test(s)) {
    return '[REDACTED_RTMPS_URL]';
  }
  if (WHIP_HINT.test(s) || /cloudflarestream\.com\/[^/\s]+\/webRTC\/publish/i.test(s)) {
    return '[REDACTED_WHIP_URL]';
  }
  if (WHEP_HINT.test(s) || /cloudflarestream\.com\/[^/\s]+\/webRTC\/play/i.test(s)) {
    return '[REDACTED_WHEP_URL]';
  }
  if (/cloudflarestream\.com/i.test(s)) {
    return '[REDACTED_STREAM_URL]';
  }
  return s;
}

/**
 * @param {unknown} value
 * @param {{
 *   apiToken?: string | null,
 *   webhookSecret?: string | null,
 *   notificationsWebhookAuth?: string | null,
 *   streamKey?: string | null,
 * }} [secrets]
 * @returns {unknown}
 */
export function redactCloudflareSecrets(value, secrets = {}) {
  if (value == null) return value;
  if (typeof value === 'string') {
    let out = redactCloudflareCapabilityUrl(value);
    const token = String(secrets.apiToken || '').trim();
    const webhook = String(secrets.webhookSecret || '').trim();
    const notif = String(secrets.notificationsWebhookAuth || '').trim();
    const streamKey = String(secrets.streamKey || '').trim();
    if (token && out.includes(token)) out = out.split(token).join('[REDACTED_API_TOKEN]');
    if (webhook && out.includes(webhook)) out = out.split(webhook).join('[REDACTED_WEBHOOK_SECRET]');
    if (notif && out.includes(notif)) out = out.split(notif).join('[REDACTED_NOTIFICATIONS_AUTH]');
    if (streamKey && out.includes(streamKey)) out = out.split(streamKey).join('[REDACTED_STREAM_KEY]');
    if (/Authorization:\s*Bearer/i.test(out)) {
      out = out.replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]');
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactCloudflareSecrets(v, secrets));
  }
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = String(k).toLowerCase();
      if (
        key.includes('token') ||
        key.includes('secret') ||
        key.includes('streamkey') ||
        key.includes('stream_key') ||
        key === 'authorization' ||
        key === 'rtmps' ||
        key === 'rtmpsurl' ||
        key === 'whipurl' ||
        key === 'whip' ||
        key === 'webrtc' ||
        key === 'webrtcplayback' ||
        key === 'publishurl' ||
        key === 'playbackurl'
      ) {
        out[k] = '[REDACTED]';
        continue;
      }
      out[k] = redactCloudflareSecrets(v, secrets);
    }
    return out;
  }
  return value;
}

/**
 * @param {unknown} err
 * @param {{
 *   apiToken?: string | null,
 *   webhookSecret?: string | null,
 *   notificationsWebhookAuth?: string | null,
 *   streamKey?: string | null,
 * }} [secrets]
 * @returns {string}
 */
export function safeCloudflareErrorMessage(err, secrets = {}) {
  const msg = err instanceof Error ? err.message : String(err || 'Cloudflare Stream error');
  return String(redactCloudflareSecrets(msg, secrets));
}
