import { describe, expect, it } from 'vitest';
import {
  isCasualChatTurn,
  shouldInjectStalePendingUploadImage,
  stripStaleUploadHandoffFromIntentSource,
} from '../intakeUploadHandoffGuard.js';

describe('intakeUploadHandoffGuard', () => {
  it('recognizes casual chat turns', () => {
    expect(isCasualChatTurn('hi')).toBe(true);
    expect(isCasualChatTurn('Hello')).toBe(true);
    expect(isCasualChatTurn('create a campaign')).toBe(false);
  });

  it('does not inject stale upload image on casual chat', () => {
    expect(
      shouldInjectStalePendingUploadImage('hi', {
        intentSourceContext: { pendingImageDataUrl: 'data:image/png;base64,abc' },
      }),
    ).toBe(false);
  });

  it('strips stale handoff fields on casual chat', () => {
    const stripped = stripStaleUploadHandoffFromIntentSource(
      {
        uploadedAssetPending: true,
        pendingImageDataUrl: 'data:image/png;base64,abc',
      },
      'hi',
    );
    expect(stripped?.uploadedAssetPending).toBeUndefined();
    expect(stripped?.pendingImageDataUrl).toBeUndefined();
  });
});
