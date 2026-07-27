import type { MediaFailureCode, MediaPlaybackFailureDetail } from './mediaFailureCodes.js';

export type MediaPlaybackError = {
  code: string;
  message: string;
  retryable: boolean;
  mediaType: 'IMAGE' | 'VIDEO';
  itemId: string;
  failureCode?: MediaFailureCode;
  detail?: Partial<MediaPlaybackFailureDetail>;
};

export function mediaError(
  code: string,
  message: string,
  input: {
    mediaType: 'IMAGE' | 'VIDEO';
    itemId: string;
    retryable?: boolean;
    failureCode?: MediaFailureCode;
    detail?: Partial<MediaPlaybackFailureDetail>;
  },
): MediaPlaybackError {
  return {
    code,
    message,
    mediaType: input.mediaType,
    itemId: input.itemId,
    retryable: input.retryable ?? true,
    failureCode: input.failureCode,
    detail: input.detail,
  };
}
