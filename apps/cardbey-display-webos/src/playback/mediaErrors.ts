export type MediaPlaybackError = {
  code: string;
  message: string;
  retryable: boolean;
  mediaType: 'IMAGE' | 'VIDEO';
  itemId: string;
};

export function mediaError(
  code: string,
  message: string,
  input: { mediaType: 'IMAGE' | 'VIDEO'; itemId: string; retryable?: boolean },
): MediaPlaybackError {
  return {
    code,
    message,
    mediaType: input.mediaType,
    itemId: input.itemId,
    retryable: input.retryable ?? true,
  };
}
