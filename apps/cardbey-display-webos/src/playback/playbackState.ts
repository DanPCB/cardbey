import type { DisplayManifestItem } from '@cardbey/display-runtime';

export type NoContentReason =
  | 'PAIRED_NO_PLAYLIST'
  | 'VALID_EMPTY_PLAYLIST'
  | 'ALL_ITEMS_OUTSIDE_SCHEDULE'
  | 'ALL_ITEMS_FAILED'
  | 'NETWORK_UNAVAILABLE_WITHOUT_CACHE';

export type PlaybackState =
  | { status: 'IDLE' }
  | {
      status: 'PREPARING';
      item: DisplayManifestItem;
      playlistId: string;
      generation: number;
    }
  | {
      status: 'PLAYING';
      item: DisplayManifestItem;
      playlistId: string;
      startedAt: string;
      generation: number;
    }
  | {
      status: 'PAUSED';
      item: DisplayManifestItem;
      playlistId: string;
      pausedAt: string;
      generation: number;
      remainingImageMs?: number;
    }
  | {
      status: 'TRANSITIONING';
      fromItemId?: string;
      toItem: DisplayManifestItem;
      generation: number;
    }
  | { status: 'WAITING_FOR_CONTENT'; reason: NoContentReason }
  | {
      status: 'FAILED';
      errorCode: string;
      itemId?: string;
      recoverable: boolean;
      reason?: NoContentReason;
    };

export type PlaybackSkipReason =
  | 'ended'
  | 'image_duration'
  | 'video_max_duration'
  | 'media_error'
  | 'load_timeout'
  | 'start_timeout'
  | 'stall_timeout'
  | 'manual_next'
  | 'schedule_invalid'
  | 'manifest_removed';

export type WatchdogKind =
  | 'LOAD_TIMEOUT'
  | 'START_TIMEOUT'
  | 'STALL_TIMEOUT'
  | 'MAX_PLAYBACK_TIMEOUT';

export type PlaybackDiagnostics = {
  playbackStatus: PlaybackState['status'];
  manifestId?: string;
  manifestRevision?: string | number;
  playlistId?: string;
  itemCount: number;
  eligibleItemCount: number;
  currentItemId?: string;
  currentItemType?: string;
  currentMediaHostPath?: string;
  startedAt?: string;
  remainingImageMs?: number;
  videoCurrentTime?: number;
  videoDuration?: number;
  videoReadyState?: number;
  videoNetworkState?: number;
  muted?: boolean;
  paused?: boolean;
  activeWatchdog?: WatchdogKind;
  lastMediaEvent?: string;
  lastMediaError?: string;
  failedItemIds: string[];
  recoveryAttemptCount: number;
  staleEventCount: number;
  lastManifestReplace?: string;
  cachedManifest: boolean;
  noContentReason?: NoContentReason;
  generation: number;
};
