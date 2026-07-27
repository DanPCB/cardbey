import { loadShellConfig } from './config/loadConfig.js';
import { DisplayShellApp } from './shell/DisplayShellApp.js';
import './shell/styles.css';

function bootStage(stage: string, detail?: string): void {
  if (typeof window.__cardbeyBootStage === 'function') {
    window.__cardbeyBootStage(stage, detail);
  } else if (window.console && console.log) {
    console.log('[Cardbey webOS boot]', stage, detail || '');
  }
}

function escapeText(value: string): string {
  return String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hideBoot(): void {
  if (window.__cardbeyBoot && typeof window.__cardbeyBoot.hide === 'function') {
    window.__cardbeyBoot.hide();
  }
}

bootStage('APP_ENTRY_EXECUTING');

async function boot(): Promise<void> {
  bootStage('INITIALIZATION_STARTED');
  bootStage('ROOT_LOOKUP', '#app');

  const root = document.getElementById('app');
  if (!root) {
    bootStage('ROOT_ELEMENT_NOT_FOUND', '#app');
    throw new Error('ROOT_ELEMENT_NOT_FOUND');
  }
  bootStage('ROOT_FOUND', '#app');

  try {
    bootStage('REACT_IMPORT_READY', 'shell modules evaluated');
    bootStage('Loading configuration');
    const config = loadShellConfig();
    let apiHost = '(invalid-api)';
    try {
      apiHost = new URL(config.runtime.apiBaseUrl).host;
    } catch {
      // keep placeholder
    }
    console.log('[Cardbey webOS boot]', {
      appVersion: config.runtime.appVersion,
      buildId: window.__CARDBEY_BUILD_ID__ || 'unknown',
      apiHost: apiHost,
      profile: config.profile,
      ua: navigator.userAgent,
      href: location.href,
    });

    bootStage('MOUNT_STARTED');
    const app = new DisplayShellApp({ root: root, config: config });
    await app.start();
    bootStage('MOUNT_COMPLETE');
    bootStage('SHELL_VISIBLE');
    hideBoot();

    (window as Window & { __cardbeyDisplayShell?: DisplayShellApp }).__cardbeyDisplayShell =
      app;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    bootStage('BOOT_FAILURE', message);
    if (window.__cardbeyBoot && typeof window.__cardbeyBoot.fail === 'function') {
      window.__cardbeyBoot.fail(error);
    }
    root.innerHTML =
      '<div class="shell"><div class="shell-safe">' +
      '<p class="brand">Cardbey <span>Display</span></p>' +
      '<h1 class="headline">Boot failed</h1>' +
      '<p class="support">' +
      escapeText(message) +
      '</p>' +
      '<div class="status-chip">ERROR</div>' +
      '</div></div>';
    console.error('[Cardbey webOS boot] boot failed', error);
  }
}

function start(): void {
  void boot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
