import { describe, expect, it } from 'vitest';
import {
  contentCodeUserMessage,
  isGenericDeviceDisplayName,
  mapPlaylistFullStateToContentCode,
  platformDisplayLabel,
  resolveDevicePresentationName,
} from '../src/platform/platformLabels.js';

describe('platformDisplayLabel', () => {
  it('maps webos_tv to LG webOS TV', () => {
    expect(platformDisplayLabel('webos_tv')).toBe('LG webOS TV');
  });

  it('maps android_tv to Android TV', () => {
    expect(platformDisplayLabel('android_tv')).toBe('Android TV');
  });

  it('does not default unknown platforms to Android TV', () => {
    expect(platformDisplayLabel('')).toBe('Display');
    expect(platformDisplayLabel('custom_box')).not.toBe('Android TV');
  });
});

describe('resolveDevicePresentationName', () => {
  it('ignores generic Android TV name on webos devices', () => {
    expect(
      resolveDevicePresentationName({
        displayName: 'Android TV',
        platform: 'webos_tv',
      }),
    ).toBe('LG webOS TV');
  });

  it('keeps a real nickname', () => {
    expect(
      resolveDevicePresentationName({
        displayName: 'Front Window',
        platform: 'webos_tv',
      }),
    ).toBe('Front Window');
  });

  it('detects generic names', () => {
    expect(isGenericDeviceDisplayName('Android TV')).toBe(true);
    expect(isGenericDeviceDisplayName('Unnamed Device')).toBe(true);
    expect(isGenericDeviceDisplayName('Lobby')).toBe(false);
  });
});

describe('mapPlaylistFullStateToContentCode', () => {
  it('maps no_binding to NOT_ASSIGNED', () => {
    expect(mapPlaylistFullStateToContentCode('no_binding')).toBe('NOT_ASSIGNED');
  });

  it('maps empty assigned playlist', () => {
    expect(mapPlaylistFullStateToContentCode('assigned_empty_playlist')).toBe('EMPTY_PLAYLIST');
  });

  it('maps 404 to DEVICE_NOT_FOUND', () => {
    expect(mapPlaylistFullStateToContentCode(undefined, { httpStatus: 404 })).toBe(
      'DEVICE_NOT_FOUND',
    );
  });

  it('uses distinct user messages', () => {
    expect(contentCodeUserMessage('NOT_ASSIGNED')).toMatch(/Assign a playlist/);
    expect(contentCodeUserMessage('EMPTY_PLAYLIST')).toMatch(/no playable content/i);
    expect(contentCodeUserMessage('DEVICE_NOT_FOUND')).toMatch(/cannot find/i);
  });
});
