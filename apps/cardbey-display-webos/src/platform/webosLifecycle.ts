export type LifecycleHandlers = {
  onForeground?: () => void;
  onBackground?: () => void;
  onRelaunch?: () => void;
};

type WebOsWindow = Window & {
  webOS?: {
    platform?: { tv?: boolean };
    deviceInfo?: (cb: (info: { modelName?: string; version?: string }) => void) => void;
  };
  PalmSystem?: {
    stageReady?: () => void;
  };
};

/**
 * Bind webOS / browser visibility lifecycle.
 * Does not require Luna services for V1 shell boot.
 */
export function bindWebOsLifecycle(handlers: LifecycleHandlers): () => void {
  const w = window as WebOsWindow;

  try {
    w.PalmSystem?.stageReady?.();
  } catch {
    // Browser / simulator without PalmSystem
  }

  const onVisibility = () => {
    if (document.hidden) handlers.onBackground?.();
    else handlers.onForeground?.();
  };

  const onPageShow = () => handlers.onForeground?.();
  const onPageHide = () => handlers.onBackground?.();
  const onFocus = () => handlers.onForeground?.();
  const onBlur = () => handlers.onBackground?.();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);

  // webOS relaunch via custom event when hosts support it
  const onRelaunch = () => handlers.onRelaunch?.();
  window.addEventListener('webOSRelaunch', onRelaunch as EventListener);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('webOSRelaunch', onRelaunch as EventListener);
  };
}

export function probeWebOsDeviceInfo(): Promise<{
  modelName?: string;
  platformVersion?: string;
  isWebOsTv: boolean;
}> {
  const w = window as WebOsWindow;
  const isWebOsTv = Boolean(w.webOS?.platform?.tv || w.PalmSystem);

  return new Promise((resolve) => {
    if (!w.webOS?.deviceInfo) {
      resolve({ isWebOsTv });
      return;
    }
    try {
      w.webOS.deviceInfo((info) => {
        resolve({
          isWebOsTv,
          modelName: info?.modelName,
          platformVersion: info?.version,
        });
      });
    } catch {
      resolve({ isWebOsTv });
    }
  });
}
