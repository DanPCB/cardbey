/**
 * Performer executor: device.sendInput — forwards desktop tasks to SuperCopilot (local bridge).
 */

const DEFAULT_BRIDGE_BASE =
  String(process.env.SUPERCOPILOT_BRIDGE_URL ?? process.env.SUPER_COPILOT_URL ?? 'http://127.0.0.1:7799').replace(
    /\/$/,
    '',
  );

function bridgeRunUrl() {
  const path = String(process.env.SUPERCOPILOT_RUN_PATH ?? '/run').trim() || '/run';
  return `${DEFAULT_BRIDGE_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * @param {object} input
 * @param {object} [_context]
 */
export async function execute(input = {}, _context = undefined) {
  const task = String(input?.task ?? input?.description ?? input?.goal ?? '').trim();
  if (!task) {
    return {
      status: 'failed',
      error: { code: 'INVALID_INPUT', message: 'task is required' },
    };
  }

  const url = bridgeRunUrl();
  const controller = new AbortController();
  const timeoutMs = Number(process.env.SUPERCOPILOT_BRIDGE_TIMEOUT_MS ?? 120_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ task, goal: task, message: task }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const rawText = await res.text();
    let parsed = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) {
      const detail =
        (parsed && (parsed.error || parsed.message || parsed.detail)) ||
        rawText.slice(0, 500) ||
        `HTTP ${res.status}`;
      return {
        status: 'failed',
        error: {
          code: 'BRIDGE_ERROR',
          message: `SuperCopilot returned an error: ${detail}`,
        },
      };
    }

    const message =
      (parsed && (parsed.message || parsed.summary || parsed.result)) ||
      (typeof parsed === 'string' ? parsed : null) ||
      rawText.slice(0, 2000) ||
      'Device task completed.';

    return {
      status: 'ok',
      output: {
        message: String(message).trim(),
        bridgeUrl: DEFAULT_BRIDGE_BASE,
        task,
        raw: parsed ?? (rawText || null),
      },
    };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err?.name === 'AbortError';
    const unreachable =
      isAbort ||
      err?.code === 'ECONNREFUSED' ||
      err?.code === 'ENOTFOUND' ||
      err?.code === 'ECONNRESET' ||
      /fetch failed/i.test(String(err?.message ?? ''));
    if (unreachable) {
      return {
        status: 'failed',
        error: {
          code: 'BRIDGE_UNREACHABLE',
          message: `SuperCopilot is not running or not reachable at ${DEFAULT_BRIDGE_BASE}. Start it from the SuperCopilot folder: python main_loop.py --serve --port 7799 (or python server.py), then retry.`,
        },
      };
    }
    return {
      status: 'failed',
      error: {
        code: 'BRIDGE_ERROR',
        message: err?.message || String(err),
      },
    };
  }
}
