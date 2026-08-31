/**
 * Signage foreground reclaim for LG webOS consumer TVs.
 *
 * Consumer webOS cannot set a third-party app as the system Home. When the
 * home launcher / screensaver takes over, we try to return to Cardbey via
 * PalmSystem.activate + applicationManager launch.
 *
 * Fails open — never throws into the player.
 */

import { safeRuntimeLog } from '../runtime/runtimeErrorReport.js';

const APP_ID = 'com.cardbey.display';
const LAUNCH_URI = 'luna://com.webos.applicationManager/launch';
const DEFAULT_RECLAIM_MS = 2_000;

export type WebOsForegroundGuardHandle = {
  /** Cancel pending reclaim and stop listening. */
  stop: () => void;
  /** Request reclaim soon if the document is still hidden. */
  requestReclaim: () => void;
};

type BridgeLike = {
  call: (uri: string, params: string) => void;
};

type WebOsWindow = Window & {
  WebOSServiceBridge?: new () => BridgeLike;
  PalmSystem?: {
    activate?: () => void;
    stageReady?: () => void;
  };
  webOS?: {
    service?: {
      request: (
        uri: string,
        options: {
          method: string;
          parameters: Record<string, unknown>;
          onSuccess?: (res: Record<string, unknown>) => void;
          onFailure?: (err: Record<string, unknown>) => void;
        },
      ) => void;
    };
  };
};

function tryActivate(): void {
  try {
    const w = window as WebOsWindow;
    if (w.PalmSystem && typeof w.PalmSystem.activate === 'function') {
      w.PalmSystem.activate();
      safeRuntimeLog('WEBOS_FOREGROUND_ACTIVATE', {});
    }
  } catch (err) {
    safeRuntimeLog('WEBOS_FOREGROUND_ACTIVATE_FAILED', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function tryLaunchSelf(): void {
  if (typeof window === 'undefined') return;
  const w = window as WebOsWindow;
  const payload = JSON.stringify({ id: APP_ID });

  if (typeof w.WebOSServiceBridge === 'function') {
    try {
      const bridge = new w.WebOSServiceBridge();
      bridge.call(LAUNCH_URI, payload);
      safeRuntimeLog('WEBOS_FOREGROUND_LAUNCH', { via: 'WebOSServiceBridge' });
      return;
    } catch (err) {
      safeRuntimeLog('WEBOS_FOREGROUND_LAUNCH_BRIDGE_FAILED', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (w.webOS && w.webOS.service && typeof w.webOS.service.request === 'function') {
    try {
      w.webOS.service.request('luna://com.webos.applicationManager', {
        method: 'launch',
        parameters: { id: APP_ID },
        onFailure: (err) => {
          safeRuntimeLog('WEBOS_FOREGROUND_LAUNCH_FAILED', {
            message: String((err && (err as { errorText?: string }).errorText) || err),
          });
        },
      });
      safeRuntimeLog('WEBOS_FOREGROUND_LAUNCH', { via: 'webOS.service' });
    } catch (err) {
      safeRuntimeLog('WEBOS_FOREGROUND_LAUNCH_SERVICE_FAILED', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function reclaimWebOsForeground(): void {
  tryActivate();
  tryLaunchSelf();
}

/**
 * When the document becomes hidden (home / screensaver takeover), reclaim
 * after a short delay if still hidden.
 */
export function startWebOsForegroundGuard(
  reclaimDelayMs = DEFAULT_RECLAIM_MS,
): WebOsForegroundGuardHandle {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const requestReclaim = () => {
    if (stopped) return;
    clear();
    timer = setTimeout(() => {
      timer = null;
      if (stopped) return;
      if (typeof document !== 'undefined' && document.hidden) {
        reclaimWebOsForeground();
      }
    }, Math.max(250, reclaimDelayMs));
  };

  const onVisibility = () => {
    if (stopped) return;
    if (document.hidden) requestReclaim();
    else clear();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return {
    requestReclaim,
    stop: () => {
      stopped = true;
      clear();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    },
  };
}
