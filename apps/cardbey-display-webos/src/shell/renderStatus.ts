import type {
  DisplayRuntimeState,
  PairingSnapshot,
} from '@cardbey/display-runtime';
import type { DisplayFeatureFlags } from '../boot/featureFlags.js';
import type { DisplayEnvProfile } from '../boot/envProfile.js';
import type { PlaybackDiagnostics, PlaybackState } from '../playback/playbackState.js';
import { userFacingPairingError } from '../pairing/pairingErrors.js';
import type { PairingViewState } from '../pairing/pairingViewState.js';

export type ShellDomParts = {
  chrome: HTMLElement;
  stage: HTMLElement;
  diagnostics: HTMLElement;
};

export type ShellViewModel = {
  state: DisplayRuntimeState;
  featureFlags: DisplayFeatureFlags;
  profile: DisplayEnvProfile;
  apiBaseUrl: string;
  dashboardBaseUrl: string;
  appVersion: string;
  modelName?: string;
  platformLabel?: string;
  presentationName?: string;
  contentCode?: string;
  canonicalDeviceId?: string;
  foreground: boolean;
  diagnosticsOpen: boolean;
  resetConfirmOpen: boolean;
  bootMessage?: string;
  pairing: PairingViewState;
  pairingSnapshot: PairingSnapshot | null;
  claimUrl?: string;
  qrDataUrl?: string;
  qrError?: string;
  secondsRemaining?: number;
  lastHeartbeatAt?: string;
  lastHeartbeatError?: string;
  lastSyncAt?: string;
  lastSyncOutcome?: string;
  lastSyncOperation?: string;
  lastSyncHttpStatus?: number;
  lastRuntimeFailure?: {
    operation: string;
    name: string;
    message: string;
    stackTruncated: string;
    sourceFile?: string;
    line?: number;
    column?: number;
    lifecycleStage?: string;
  };
  fixtureMode: boolean;
  playback?: PlaybackState;
  playbackDiagnostics?: PlaybackDiagnostics;
  hideChromeForPlayback?: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCode(code: string): string {
  // Visual grouping only — does not alter copy semantics for claim.
  const compact = code.replace(/\s+/g, '');
  if (compact.length === 6) return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  return compact;
}

function formatCountdown(seconds?: number): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function maskId(id?: string): string {
  if (!id) return '—';
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function maskUrl(url?: string): string {
  if (!url) return '—';
  try {
    const u = new URL(url);
    const path = u.pathname.length > 36 ? `${u.pathname.slice(0, 32)}…` : u.pathname;
    return `${u.host}${path}`;
  } catch {
    return url.length > 48 ? `${url.slice(0, 45)}…` : url;
  }
}

/** Preserve #playback-stage across re-renders so media elements survive. */
export function ensureShellDom(root: HTMLElement): ShellDomParts {
  root.classList.add('shell');
  let chrome = root.querySelector<HTMLElement>('#shell-chrome');
  let stage = root.querySelector<HTMLElement>('#playback-stage');
  let diagnostics = root.querySelector<HTMLElement>('#shell-diagnostics');
  if (!chrome || !stage || !diagnostics) {
    root.innerHTML = `
      <div id="shell-chrome"></div>
      <div class="stage" id="playback-stage" aria-hidden="true"></div>
      <aside id="shell-diagnostics" class="diagnostics" aria-live="polite"></aside>
    `;
    chrome = root.querySelector<HTMLElement>('#shell-chrome')!;
    stage = root.querySelector<HTMLElement>('#playback-stage')!;
    diagnostics = root.querySelector<HTMLElement>('#shell-diagnostics')!;
  }
  return { chrome, stage, diagnostics };
}

export function renderShell(root: HTMLElement, vm: ShellViewModel): ShellDomParts {
  const parts = ensureShellDom(root);
  root.className = `shell lifecycle-dim${vm.foreground ? '' : ' is-background'}${
    vm.hideChromeForPlayback ? ' is-playing' : ''
  }`;
  parts.chrome.innerHTML = renderMain(vm);
  parts.chrome.hidden = Boolean(vm.hideChromeForPlayback);
  parts.diagnostics.className = `diagnostics${vm.diagnosticsOpen ? ' is-open' : ''}`;
  parts.diagnostics.innerHTML = renderDiagnosticsInner(vm);
  return parts;
}

function renderMain(vm: ShellViewModel): string {
  const pairing = vm.pairing;

  if (pairing.status === 'WAITING') {
    return `
      <div class="shell-safe pairing-layout">
        <p class="brand">Cardbey <span>Display</span></p>
        <h1 class="headline">Connect this screen</h1>
        <p class="support">
          Open Cardbey on your phone or computer.
          Go to <strong>Devices</strong> and enter this code:
        </p>
        <div class="pairing-code" aria-label="Pairing code">${escapeHtml(formatCode(pairing.code))}</div>
        <p class="countdown">Code expires in ${escapeHtml(formatCountdown(vm.secondsRemaining))}</p>
        <p class="network-line">${vm.state.networkOnline ? 'Online' : 'Offline'} · ${escapeHtml(vm.state.status)}</p>
        <div class="pairing-side">
          ${
            vm.qrDataUrl
              ? `<img class="pairing-qr" src="${vm.qrDataUrl}" alt="QR code to open Cardbey Devices claim page" width="280" height="280" />`
              : `<div class="pairing-qr pairing-qr-fallback">QR unavailable${vm.qrError ? ` (${escapeHtml(vm.qrError)})` : ''}. Enter the code in Devices.</div>`
          }
          <p class="claim-hint">Or scan to open Devices with this code prefilled.</p>
        </div>
        <p class="hint">Info opens diagnostics. Back does not exit while pairing.</p>
      </div>
    `;
  }

  if (pairing.status === 'REQUESTING' || pairing.status === 'COMPLETING' || pairing.status === 'CLAIMED') {
    const label =
      pairing.status === 'REQUESTING'
        ? 'Requesting connection code…'
        : pairing.status === 'CLAIMED'
          ? 'Code claimed. Finishing connection…'
          : 'Finishing connection…';
    return `
      <div class="shell-safe">
        <p class="brand">Cardbey <span>Display</span></p>
        <h1 class="headline">${escapeHtml(label)}</h1>
        <div class="status-chip">${escapeHtml(vm.state.status)}</div>
      </div>
    `;
  }

  if (pairing.status === 'EXPIRED' || pairing.status === 'FAILED') {
    const message =
      pairing.status === 'EXPIRED'
        ? userFacingPairingError('DISPLAY_PAIRING_EXPIRED')
        : userFacingPairingError(pairing.errorCode, pairing.message);
    return `
      <div class="shell-safe">
        <p class="brand">Cardbey <span>Display</span></p>
        <h1 class="headline">${pairing.status === 'EXPIRED' ? 'Code expired' : 'Could not connect'}</h1>
        <p class="support">${escapeHtml(message)}</p>
        <button class="tv-button" data-action="retry" autofocus>Retry</button>
        <p class="hint">Press OK to retry. Support code: ${escapeHtml(
          pairing.status === 'FAILED' ? pairing.errorCode : 'DISPLAY_PAIRING_EXPIRED',
        )}</p>
      </div>
    `;
  }

  if (vm.playback?.status === 'WAITING_FOR_CONTENT' || vm.playback?.status === 'FAILED') {
    const reason =
      vm.playback.status === 'WAITING_FOR_CONTENT'
        ? vm.playback.reason
        : vm.playback.reason || vm.playback.errorCode;
    const failure = vm.playbackDiagnostics?.lastFailureDetail;
    const failureCode =
      vm.playbackDiagnostics?.lastFailureCode ||
      (vm.playback.status === 'FAILED' ? vm.playback.errorCode : undefined);
    const headline =
      reason === 'ALL_ITEMS_FAILED'
        ? 'Unable to play content'
        : reason === 'ALL_ITEMS_OUTSIDE_SCHEDULE'
          ? 'No content scheduled right now'
          : 'This screen is connected';
    const support =
      reason === 'ALL_ITEMS_FAILED'
        ? failureCode
          ? `${failureCode}: HTTP ${failure?.httpStatus ?? '—'} · ${maskUrl(failure?.originalUrl)}`
          : 'Every media item failed. Retrying shortly…'
        : reason === 'ALL_ITEMS_OUTSIDE_SCHEDULE'
          ? 'Playlist connected. No content is scheduled for the current time.'
          : vm.bootMessage || 'Waiting for content from Cardbey.';
    const chipReason = failureCode || String(vm.contentCode || reason);
    return `
      <div class="shell-safe">
        <p class="brand">Cardbey <span>Display</span></p>
        <h1 class="headline">${escapeHtml(headline)}</h1>
        <p class="support">${escapeHtml(support)}</p>
        ${
          failure
            ? `<p class="support subtle">Item ${escapeHtml(
                maskId(failure.itemId),
              )} · ${escapeHtml(failure.mediaType)} · MIME ${escapeHtml(
                failure.mimeType || '—',
              )}</p>`
            : ''
        }
        <div class="status-chip">${escapeHtml(vm.state.status)} · ${escapeHtml(chipReason)}</div>
        <p class="support subtle">${escapeHtml(connectedSubtitle(vm))}</p>
        <p class="hint">Info opens diagnostics.</p>
      </div>
    `;
  }

  if (
    vm.state.session?.pairingState === 'PAIRED' &&
    (vm.state.status === 'READY' ||
      vm.state.status === 'SYNCING' ||
      vm.state.status === 'PLAYING' ||
      vm.state.status === 'PAUSED' ||
      vm.state.status === 'OFFLINE_PLAYBACK')
  ) {
    const hasItems = Boolean(
      vm.state.manifest && vm.state.manifest.playlist.items.length > 0,
    );
    const playing = vm.playback?.status === 'PLAYING' || vm.playback?.status === 'PAUSED';
    return `
      <div class="shell-safe">
        <p class="brand">Cardbey <span>Display</span></p>
        <h1 class="headline">${
          playing
            ? vm.playback?.status === 'PAUSED'
              ? 'Paused'
              : 'Playing'
            : hasItems
              ? 'Ready to play'
              : 'This screen is connected'
        }</h1>
        <p class="support">
          ${
            hasItems
              ? escapeHtml(vm.bootMessage || 'Playlist assigned.')
              : escapeHtml(
                  vm.bootMessage ||
                    'This screen is connected. Assign a playlist from Cardbey.',
                )
          }
        </p>
        <div class="status-chip">${escapeHtml(vm.state.status)}${
          vm.playback ? ` · ${escapeHtml(vm.playback.status)}` : ''
        }${vm.contentCode ? ` · ${escapeHtml(vm.contentCode)}` : ''}</div>
        <p class="support subtle">${escapeHtml(connectedSubtitle(vm))}</p>
        <p class="hint">Info opens diagnostics. Play/Pause on the remote controls playback.</p>
      </div>
    `;
  }

  return `
    <div class="shell-safe">
      <p class="brand">Cardbey <span>Display</span></p>
      <h1 class="headline">${escapeHtml(statusHeadline(vm))}</h1>
      <p class="support">${escapeHtml(vm.bootMessage || statusSupport(vm))}</p>
      <div class="status-chip">${escapeHtml(vm.state.status)}</div>
      ${
        vm.featureFlags.enablePairing &&
        (pairing.status === 'IDLE' || pairing.status === 'CANCELLED')
          ? `<button class="tv-button" data-action="retry" autofocus>Start pairing</button>`
          : ''
      }
      <p class="hint">Info toggles diagnostics.</p>
    </div>
  `;
}

function connectedSubtitle(vm: ShellViewModel): string {
  const platform = vm.platformLabel || 'Display';
  const name = vm.presentationName && vm.presentationName !== platform ? vm.presentationName : '';
  const deviceId = vm.canonicalDeviceId ? maskId(vm.canonicalDeviceId) : '';
  return [platform, name, deviceId].filter(Boolean).join(' · ');
}

function statusHeadline(vm: ShellViewModel): string {
  switch (vm.state.status) {
    case 'BOOTING':
      return 'Starting display';
    case 'UNPAIRED':
      return 'Waiting to pair';
    case 'PAIRING':
      return 'Pairing in progress';
    case 'ERROR':
      return 'Display error';
    default:
      return 'Cardbey Display';
  }
}

function statusSupport(vm: ShellViewModel): string {
  if (!vm.featureFlags.enablePairing) {
    return 'Pairing is disabled for this environment profile.';
  }
  return 'Press OK to request a pairing code.';
}

function renderDiagnosticsInner(vm: ShellViewModel): string {
  const snap = vm.pairingSnapshot;
  const pb = vm.playbackDiagnostics;
  return `
      <h2>Diagnostics</h2>
      <dl>
        <dt>Profile</dt><dd>${escapeHtml(vm.profile)}${vm.fixtureMode ? ' · FIXTURE' : ''}</dd>
        <dt>Platform</dt><dd>${escapeHtml(vm.platformLabel || '—')}</dd>
        <dt>Presentation</dt><dd>${escapeHtml(vm.presentationName || '—')}</dd>
        <dt>Device ID</dt><dd>${escapeHtml(maskId(vm.canonicalDeviceId || vm.state.session?.deviceId))}</dd>
        <dt>Content code</dt><dd>${escapeHtml(vm.contentCode || '—')}</dd>
        <dt>Sync</dt><dd>${escapeHtml(vm.lastSyncOutcome || '—')} @ ${escapeHtml(vm.lastSyncAt || '—')}</dd>
        <dt>Sync op</dt><dd>${escapeHtml(vm.lastSyncOperation || '—')}</dd>
        <dt>HTTP</dt><dd>${escapeHtml(
          vm.lastSyncHttpStatus != null ? String(vm.lastSyncHttpStatus) : '—',
        )}</dd>
        <dt>Failure</dt><dd>${escapeHtml(
          vm.lastRuntimeFailure
            ? `${vm.lastRuntimeFailure.operation} · ${vm.lastRuntimeFailure.name}: ${vm.lastRuntimeFailure.message}`
            : '—',
        )}</dd>
        <dt>Fail loc</dt><dd>${escapeHtml(
          vm.lastRuntimeFailure?.sourceFile
            ? `${vm.lastRuntimeFailure.sourceFile}:${vm.lastRuntimeFailure.line ?? '?'}:${vm.lastRuntimeFailure.column ?? '?'}`
            : '—',
        )}</dd>
        <dt>Stack</dt><dd class="diag-stack">${escapeHtml(
          vm.lastRuntimeFailure?.stackTruncated || '—',
        )}</dd>
        <dt>Runtime</dt><dd>${escapeHtml(vm.state.status)}</dd>
        <dt>Playback</dt><dd>${escapeHtml(vm.playback?.status || pb?.playbackStatus || '—')}</dd>
        <dt>Manifest</dt><dd>${escapeHtml(
          pb ? `${pb.manifestId || '—'}@${String(pb.manifestRevision ?? '—')}` : '—',
        )}</dd>
        <dt>Playlist</dt><dd>${escapeHtml(pb?.playlistId || '—')} (${pb?.eligibleItemCount ?? 0}/${
          pb?.itemCount ?? 0
        })</dd>
        <dt>Item</dt><dd>${escapeHtml(pb?.currentItemId || '—')} (${escapeHtml(
          pb?.currentItemType || '—',
        )})</dd>
        <dt>Media</dt><dd>${escapeHtml(pb?.currentMediaHostPath || '—')}</dd>
        <dt>Watchdog</dt><dd>${escapeHtml(pb?.activeWatchdog || '—')}</dd>
        <dt>Failed items</dt><dd>${escapeHtml(pb?.failedItemIds?.join(', ') || '—')}</dd>
        <dt>Stale events</dt><dd>${pb?.staleEventCount ?? 0}</dd>
        <dt>Last media</dt><dd>${escapeHtml(pb?.lastMediaEvent || '—')} / ${escapeHtml(
          pb?.lastMediaError || '—',
        )}</dd>
        <dt>Fail code</dt><dd>${escapeHtml(pb?.lastFailureCode || '—')}</dd>
        <dt>Fail item</dt><dd>${escapeHtml(
          pb?.lastFailureDetail
            ? `${maskId(pb.lastFailureDetail.itemId)} · ${pb.lastFailureDetail.mediaType}`
            : '—',
        )}</dd>
        <dt>Fail URL</dt><dd>${escapeHtml(
          pb?.lastFailureDetail ? maskUrl(pb.lastFailureDetail.originalUrl) : '—',
        )}</dd>
        <dt>Fail HTTP</dt><dd>${escapeHtml(
          pb?.lastFailureDetail?.httpStatus != null
            ? String(pb.lastFailureDetail.httpStatus)
            : '—',
        )}</dd>
        <dt>Fail MIME</dt><dd>${escapeHtml(pb?.lastFailureDetail?.mimeType || '—')}</dd>
        <dt>HTML err</dt><dd>${escapeHtml(
          pb?.lastFailureDetail?.htmlMediaErrorCode != null
            ? String(pb.lastFailureDetail.htmlMediaErrorCode)
            : '—',
        )}</dd>
        <dt>Watchdog</dt><dd>${escapeHtml(
          pb?.lastFailureDetail?.watchdogStage || pb?.activeWatchdog || '—',
        )}</dd>
        <dt>Replace</dt><dd>${escapeHtml(pb?.lastManifestReplace || '—')}</dd>
        <dt>Pairing UI</dt><dd>${escapeHtml(vm.pairing.status)}</dd>
        <dt>Pair ctrl</dt><dd>${escapeHtml(snap?.status || '—')}</dd>
        <dt>Session</dt><dd>${escapeHtml(maskId(snap?.sessionId || vm.state.session?.sessionId))}</dd>
        <dt>Code</dt><dd>${
          vm.state.session?.pairingState === 'PAIRED'
            ? '—'
            : escapeHtml(snap?.code || (vm.pairing.status === 'WAITING' ? vm.pairing.code : '—'))
        }</dd>
        <dt>Expires</dt><dd>${escapeHtml(snap?.expiresAt || '—')}</dd>
        <dt>Remaining</dt><dd>${escapeHtml(formatCountdown(vm.secondsRemaining))}</dd>
        <dt>Last request</dt><dd>${escapeHtml(snap?.lastRequestAt || '—')}</dd>
        <dt>Last poll</dt><dd>${escapeHtml(snap?.lastPollAt || '—')} (${escapeHtml(
          snap?.lastPollStatus || '—',
        )})</dd>
        <dt>Complete</dt><dd>${snap?.completionInFlight ? 'in flight' : snap?.status || '—'}</dd>
        <dt>Stored session</dt><dd>${vm.state.session?.pairingState === 'PAIRED' ? 'yes' : 'no'}</dd>
        <dt>Device</dt><dd>${escapeHtml(maskId(vm.state.session?.deviceId))}</dd>
        <dt>API</dt><dd>${escapeHtml(vm.apiBaseUrl)}</dd>
        <dt>Dashboard</dt><dd>${escapeHtml(vm.dashboardBaseUrl)}</dd>
        <dt>Heartbeat</dt><dd>${escapeHtml(vm.lastHeartbeatAt || '—')}${
          vm.lastHeartbeatError ? ` · err: ${escapeHtml(vm.lastHeartbeatError)}` : ''
        }</dd>
        <dt>Sync</dt><dd>${escapeHtml(vm.lastSyncAt || '—')} (${escapeHtml(
          vm.lastSyncOutcome || '—',
        )})</dd>
        <dt>Network</dt><dd>${vm.state.networkOnline ? 'online' : 'offline'}</dd>
        <dt>Model</dt><dd>${escapeHtml(vm.modelName || 'browser/simulator')}</dd>
        <dt>Version</dt><dd>${escapeHtml(vm.appVersion)}</dd>
        <dt>Flags</dt><dd>${escapeHtml(formatFlags(vm.featureFlags))}</dd>
        <dt>Error</dt><dd>${escapeHtml(vm.state.errorMessage || vm.state.errorCode || '—')}</dd>
      </dl>
      <div class="diag-actions">
        <button class="tv-button tv-button-secondary" data-action="toggle-diagnostics">Close</button>
        <button class="tv-button tv-button-danger" data-action="request-reset">Reset this screen</button>
      </div>
      ${
        vm.resetConfirmOpen
          ? `<div class="reset-confirm">
              <p><strong>Reset this screen?</strong></p>
              <p>This removes the Cardbey connection from this TV.
              The device record may remain visible in the Cardbey dashboard.</p>
              <button class="tv-button tv-button-danger" data-action="confirm-reset">Confirm local reset</button>
              <button class="tv-button tv-button-secondary" data-action="cancel-reset">Cancel</button>
            </div>`
          : ''
      }
  `;
}

function formatFlags(flags: DisplayFeatureFlags): string {
  return (
    Object.entries(flags)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ') || 'none enabled'
  );
}
