import { describe, it, expect } from 'vitest';
import { execute as selectDisplayContent } from '../../toolExecutors/display/select_display_content.js';
import { execute as formatForDisplay } from '../../toolExecutors/display/format_for_display.js';
import { execute as pushToDisplayDevice } from '../../toolExecutors/display/push_to_display_device.js';
import { execute as verifyDisplayOutput } from '../../toolExecutors/display/verify_display_output.js';

describe('display executors', () => {
  it('select_display_content blocks placeholder assets until real media is wired', async () => {
    const result = await selectDisplayContent({
      storeId: 'store-1',
      contentType: 'campaign',
      artifactId: 'artifact-1',
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('placeholder_content');
    expect(result.output?.partial?.content?.id).toBe('artifact-1');
    expect(result.output?.partial?.content?.assets?.[0]?.placeholder).toBe(true);
  });

  it('format_for_display applies default profile when none given', async () => {
    const result = await formatForDisplay({
      content: { id: 'c1', title: 'Promo', assets: [] },
    });

    expect(result.status).toBe('ok');
    expect(result.output?.formatted?.displayProfile).toEqual({
      width: 1920,
      height: 1080,
      durationPerSlide: 5000,
      loop: true,
      transition: 'fade',
    });
    expect(result.output?.formatted?.readyForDevice).toBe(true);
    expect(result.output?.formatted?.formattedAt).toBeTruthy();
  });

  it('format_for_display applies custom profile when provided', async () => {
    const result = await formatForDisplay({
      content: { id: 'c1' },
      displayProfile: { width: 1080, height: 1920, transition: 'slide' },
    });

    expect(result.output?.formatted?.displayProfile).toMatchObject({
      width: 1080,
      height: 1920,
      durationPerSlide: 5000,
      loop: true,
      transition: 'slide',
    });
  });

  it('push_to_display_device is blocked until device transport is wired', async () => {
    const result = await pushToDisplayDevice({
      deviceId: 'device-1',
      storeId: 'store-1',
      formatted: { id: 'c1', readyForDevice: true },
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('display_push_not_wired');
    expect(result.output?.partial?.status).toBe('queued');
    expect(result.output?.partial?.deviceId).toBe('device-1');
  });

  it('verify_display_output blocks when push result is a stub', async () => {
    const result = await verifyDisplayOutput({
      deviceId: 'device-1',
      contentId: 'content-1',
      pushResult: { ok: true, status: 'queued' },
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('playback_not_verified');
    expect(result.output?.partial?.verified).toBe(false);
    expect(result.output?.partial?.deviceStatus).toBe('error');
  });

  it('verify_display_output blocks when pushResult fails', async () => {
    const result = await verifyDisplayOutput({
      deviceId: 'device-1',
      contentId: 'content-1',
      pushResult: { ok: false, status: 'failed' },
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('playback_not_verified');
    expect(result.output?.partial?.verified).toBe(false);
    expect(result.output?.partial?.deviceStatus).toBe('error');
  });
});
