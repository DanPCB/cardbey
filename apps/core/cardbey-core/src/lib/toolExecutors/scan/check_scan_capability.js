// DANH: skill-round5-cardscan
/**
 * check_scan_capability — probe SuperCopilot bridge health (read-only).
 */

const BRIDGE_URL = 'http://localhost:7799/health';
const TIMEOUT_MS = 2000;

export async function execute(input = {}) {
  const userId = typeof input?.userId === 'string' ? input.userId : null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(BRIDGE_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      return {
        status: 'ok',
        output: {
          available: true,
          bridgeUrl: 'http://localhost:7799',
          userId,
        },
      };
    }
  } catch {
    /* bridge unreachable */
  }

  return {
    status: 'ok',
    output: {
      available: false,
      bridgeUrl: null,
      reason: 'SuperCopilot bridge not reachable at port 7799',
      userId,
    },
  };
}

export default execute;
