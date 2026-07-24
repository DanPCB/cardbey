/**
 * Stable media failure codes for Cardbey Display (webOS).
 * Keep distinct — do not collapse into ALL_ITEMS_FAILED in diagnostics.
 */
export type MediaFailureCode =
  | 'MEDIA_HTTP_404'
  | 'MEDIA_HTTP_403'
  | 'MEDIA_TLS_FAILURE'
  | 'MEDIA_UNSUPPORTED_CODEC'
  | 'MEDIA_UNSUPPORTED_FORMAT'
  | 'MEDIA_IMAGE_LOAD_FAILED'
  | 'MEDIA_VIDEO_LOAD_FAILED'
  | 'MEDIA_PLAY_REJECTED'
  | 'MEDIA_TIMEOUT'
  | 'MEDIA_INVALID_URL'
  | 'MEDIA_EMPTY_RESPONSE'
  | 'MEDIA_ABORTED'
  | 'MEDIA_NETWORK_ERROR'
  | 'MEDIA_DECODE_ERROR'
  | 'MEDIA_SRC_NOT_SUPPORTED'
  | 'MEDIA_UNKNOWN';

export type MediaItemProbeResult = {
  itemId: string;
  mediaType: 'IMAGE' | 'VIDEO';
  originalUrl: string;
  resolvedUrl: string;
  ok: boolean;
  httpStatus?: number;
  mimeType?: string;
  contentLength?: number | null;
  redirectChain: string[];
  failureCode?: MediaFailureCode;
  failureMessage?: string;
  probeMethod: 'HEAD' | 'GET' | 'NONE';
};

export type MediaPlaybackFailureDetail = {
  itemId: string;
  mediaType: 'IMAGE' | 'VIDEO';
  originalUrl: string;
  resolvedUrl?: string;
  mimeType?: string;
  httpStatus?: number;
  redirectChain?: string[];
  contentLength?: number | null;
  renderer: 'IMAGE' | 'VIDEO' | 'NONE';
  failureCode: MediaFailureCode;
  htmlMediaErrorCode?: number;
  htmlMediaErrorMessage?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  watchdogStage?: string;
  lastMediaEvent?: string;
  playRejection?: string;
  at: string;
};

export function translateVideoErrorCode(code: number | undefined | null): MediaFailureCode {
  switch (code) {
    case 1:
      return 'MEDIA_ABORTED';
    case 2:
      return 'MEDIA_NETWORK_ERROR';
    case 3:
      return 'MEDIA_DECODE_ERROR';
    case 4:
      return 'MEDIA_SRC_NOT_SUPPORTED';
    default:
      return 'MEDIA_VIDEO_LOAD_FAILED';
  }
}

export function failureCodeFromHttpStatus(status: number): MediaFailureCode {
  if (status === 404) return 'MEDIA_HTTP_404';
  if (status === 403) return 'MEDIA_HTTP_403';
  if (status === 0) return 'MEDIA_TLS_FAILURE';
  if (status >= 400) return 'MEDIA_NETWORK_ERROR';
  return 'MEDIA_UNKNOWN';
}

export function userMessageForMediaFailure(code: MediaFailureCode): string {
  switch (code) {
    case 'MEDIA_HTTP_404':
      return 'Media file was not found (HTTP 404).';
    case 'MEDIA_HTTP_403':
      return 'Media file access was denied (HTTP 403).';
    case 'MEDIA_TLS_FAILURE':
      return 'Secure media download failed (TLS/network).';
    case 'MEDIA_UNSUPPORTED_CODEC':
      return 'Video codec is not supported on this TV.';
    case 'MEDIA_UNSUPPORTED_FORMAT':
      return 'Media format is not supported on this TV.';
    case 'MEDIA_IMAGE_LOAD_FAILED':
      return 'Image failed to load.';
    case 'MEDIA_VIDEO_LOAD_FAILED':
      return 'Video failed to load.';
    case 'MEDIA_PLAY_REJECTED':
      return 'Video play() was rejected by the TV.';
    case 'MEDIA_TIMEOUT':
      return 'Media load timed out.';
    case 'MEDIA_INVALID_URL':
      return 'Media URL is invalid.';
    case 'MEDIA_EMPTY_RESPONSE':
      return 'Media URL returned an empty body.';
    case 'MEDIA_ABORTED':
      return 'Media download was aborted.';
    case 'MEDIA_NETWORK_ERROR':
      return 'Media network error.';
    case 'MEDIA_DECODE_ERROR':
      return 'TV could not decode this media (codec).';
    case 'MEDIA_SRC_NOT_SUPPORTED':
      return 'Media source is not supported by this TV.';
    default:
      return 'Media item failed for an unknown reason.';
  }
}
