/**
 * verify_display_output — Confirm device received and is playing content (Phase 3: pushResult-based).
 */

/**
 * @param {object} [input]
 * @param {string|null} [input.deviceId]
 * @param {string|null} [input.contentId]
 * @param {object} [input.pushResult]
 */
export async function execute(input = {}) {
  try {
    const pushResult = input?.pushResult && typeof input.pushResult === 'object' ? input.pushResult : {};
    const verified = pushResult.ok === true;
    const deviceStatus = verified ? 'playing' : 'error';
    const message = verified
      ? 'Device received content and is playing'
      : 'Device did not confirm playback';

    return {
      status: 'ok',
      output: {
        ok: true,
        verified,
        deviceStatus,
        message,
        deviceId: input?.deviceId ?? pushResult.deviceId ?? null,
        contentId: input?.contentId ?? null,
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      status: 'failed',
      error: { code: 'VERIFY_FAILED', message },
      output: { ok: false, verified: false, deviceStatus: 'error', message },
    };
  }
}

export default execute;
