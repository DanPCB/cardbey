import { describe, expect, it } from 'vitest';
import { detectAssetType, sumAssetStorage } from '../src/lib/content/assetTypes.js';

describe('content assetTypes', () => {
  it('detects image/video/audio/document types', () => {
    expect(detectAssetType('image/png', 'photo.png')).toBe('image');
    expect(detectAssetType('video/mp4', 'clip.mp4')).toBe('video');
    expect(detectAssetType('audio/mpeg', 'track.mp3')).toBe('audio');
    expect(detectAssetType('application/pdf', 'menu.pdf')).toBe('document');
  });

  it('sums asset storage bytes', () => {
    expect(sumAssetStorage([{ fileSize: 100 }, { fileSize: 250 }])).toBe(350);
  });
});
