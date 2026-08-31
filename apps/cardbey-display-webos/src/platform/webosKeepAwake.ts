/**
 * Prevent LG webOS home screensaver while Cardbey Display is foreground.
 *
 * Official policy: screensaver runs after idle except during fullscreen video.
 * Signage (images / mixed playlists) still needs an explicit reject via
 * tvpower registerScreenSaverRequest (widely used; not in public docs).
 *
 * Fails open on browser / missing Luna — never throws into the player.
 */

import { safeRuntimeLog } from '../runtime/runtimeErrorReport.js';

const CLIENT_NAME = 'com.cardbey.display';
const REGISTER_URI =
  'luna://com.webos.service.tvpower/power/registerScreenSaverRequest';
const RESPOND_URI =
  'luna://com.webos.service.tvpower/power/responseScreenSaverRequest';

export type WebOsKeepAwakeHandle = {
  /** When false, screensaver requests are acknowledged (allowed). */
  setEnabled: (enabled: boolean) => void;
  stop: () => void;
};

type BridgeLike = {
  onservicecallback: ((msg: string) => void) | null;
  call: (uri: string, params: string) => void;
};

type WebOsWindow = Window & {
  WebOSServiceBridge?: new () => BridgeLike;
  webOS?: {
    service?: {
      request: (
        uri: string,
        options: {
          method: string;
          parameters: Record<string, unknown>;
          subscribe?: boolean;
          onSuccess?: (res: Record<string, unknown>) => void;
          onFailure?: (err: Record<string, unknown>) => void;
        },
      ) => { cancel?: () => void };
    };
  };
};

function parseMessage(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // ignore
  }
  return null;
}

function respondReject(bridge: BridgeLike, timestamp: string): void {
  bridge.call(
    RESPOND_URI,
    JSON.stringify({
      clientName: CLIENT_NAME,
      ack: false,
      timestamp,
    }),
  );
}

/**
 * Subscribe to screensaver requests and reject them while enabled.
 * Returns a no-op handle when Luna / WebOSServiceBridge is unavailable.
 */
export function startWebOsKeepAwake(): WebOsKeepAwakeHandle {
  let enabled = true;
  let stopped = false;
  let cancelSub: (() => void) | null = null;

  const noop: WebOsKeepAwakeHandle = {
    setEnabled: (next) => {
      enabled = next;
    },
    stop: () => {
      stopped = true;
      enabled = false;
    },
  };

  if (typeof window === 'undefined') return noop;
  const w = window as WebOsWindow;

  const onRequest = (msg: Record<string, unknown>, respond: (timestamp: string) => void) => {
    if (stopped || !enabled) return;
    if (String(msg.state || '') !== 'Active') return;
    const timestamp = msg.timestamp != null ? String(msg.timestamp) : '';
    if (!timestamp) return;
    try {
      respond(timestamp);
      safeRuntimeLog('WEBOS_SCREENSAVER_REJECTED', { timestamp });
    } catch (err) {
      safeRuntimeLog('WEBOS_SCREENSAVER_REJECT_FAILED', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Preferred path: WebOSServiceBridge (packaged web apps)
  if (typeof w.WebOSServiceBridge === 'function') {
    try {
      const bridge = new w.WebOSServiceBridge();
      bridge.onservicecallback = (raw: string) => {
        const msg = parseMessage(raw);
        if (!msg) return;
        onRequest(msg, (timestamp) => respondReject(bridge, timestamp));
      };
      bridge.call(
        REGISTER_URI,
        JSON.stringify({ subscribe: true, clientName: CLIENT_NAME }),
      );
      safeRuntimeLog('WEBOS_KEEP_AWAKE_STARTED', { via: 'WebOSServiceBridge' });
      return {
        setEnabled: (next) => {
          enabled = next;
        },
        stop: () => {
          stopped = true;
          enabled = false;
          bridge.onservicecallback = null;
        },
      };
    } catch (err) {
      safeRuntimeLog('WEBOS_KEEP_AWAKE_BRIDGE_FAILED', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback: webOS.service.request (when webOSTV.js is present)
  if (w.webOS && w.webOS.service && typeof w.webOS.service.request === 'function') {
    try {
      const sub = w.webOS.service.request('luna://com.webos.service.tvpower', {
        method: 'power/registerScreenSaverRequest',
        parameters: { subscribe: true, clientName: CLIENT_NAME },
        subscribe: true,
        onSuccess: (msg) => {
          onRequest(msg, (timestamp) => {
            w.webOS!.service!.request('luna://com.webos.service.tvpower', {
              method: 'power/responseScreenSaverRequest',
              parameters: {
                clientName: CLIENT_NAME,
                ack: false,
                timestamp,
              },
            });
          });
        },
        onFailure: (err) => {
          safeRuntimeLog('WEBOS_KEEP_AWAKE_SUBSCRIBE_FAILED', {
            message: String((err && (err as { errorText?: string }).errorText) || err),
          });
        },
      });
      cancelSub = () => {
        try {
          sub.cancel && sub.cancel();
        } catch {
          // ignore
        }
      };
      safeRuntimeLog('WEBOS_KEEP_AWAKE_STARTED', { via: 'webOS.service' });
      return {
        setEnabled: (next) => {
          enabled = next;
        },
        stop: () => {
          stopped = true;
          enabled = false;
          if (cancelSub) cancelSub();
          cancelSub = null;
        },
      };
    } catch (err) {
      safeRuntimeLog('WEBOS_KEEP_AWAKE_SERVICE_FAILED', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  safeRuntimeLog('WEBOS_KEEP_AWAKE_UNAVAILABLE', {});
  return noop;
}
