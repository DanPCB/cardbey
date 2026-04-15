/**
 * Process-wide shutdown coordination so long-running work (e.g. OpenAI image calls)
 * can abort promptly when SIGINT/SIGTERM is received.
 */

const controller = new AbortController();

export function signalShutdown() {
  try {
    controller.abort();
  } catch {
    /* ignore */
  }
}

export function isShutdownRequested() {
  return controller.signal.aborted;
}

export function getShutdownSignal() {
  return controller.signal;
}
