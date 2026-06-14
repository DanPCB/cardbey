import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('exifr', () => ({
  default: {
    gps: vi.fn(),
  },
}));

import exifr from 'exifr';
import {
  parseClientLocation,
  readExifGpsFromBuffer,
  resolveVisionLocation,
} from '../locationResolver.js';

describe('locationResolver', () => {
  beforeEach(() => {
    vi.mocked(exifr.gps).mockReset();
  });

  it('parseClientLocation accepts valid lat/lng', () => {
    expect(parseClientLocation({ lat: -37.81, lng: 144.96 })).toEqual({
      lat: -37.81,
      lng: 144.96,
    });
  });

  it('parseClientLocation rejects invalid coordinates', () => {
    expect(parseClientLocation({ lat: 999, lng: 0 })).toBeNull();
    expect(parseClientLocation(null)).toBeNull();
  });

  it('readExifGpsFromBuffer returns GPS when exifr finds coordinates', async () => {
    vi.mocked(exifr.gps).mockResolvedValue({ latitude: -37.8, longitude: 144.9 });
    const gps = await readExifGpsFromBuffer(Buffer.from('fake-image'));
    expect(gps).toEqual({ lat: -37.8, lng: 144.9 });
  });

  it('resolveVisionLocation prefers EXIF over client location', async () => {
    vi.mocked(exifr.gps).mockResolvedValue({ latitude: 1, longitude: 2 });
    const result = await resolveVisionLocation({
      imageBuffers: [Buffer.from('with-exif')],
      clientLocation: { lat: 10, lng: 20 },
    });
    expect(result.location).toEqual({ lat: 1, lng: 2, source: 'exif' });
    expect(result.needsLocation).toBe(false);
  });

  it('resolveVisionLocation falls back to client location when EXIF is stripped', async () => {
    vi.mocked(exifr.gps).mockResolvedValue(undefined);
    const result = await resolveVisionLocation({
      imageBuffers: [Buffer.from('no-exif')],
      clientLocation: { lat: -33.86, lng: 151.2 },
    });
    expect(result.location).toEqual({ lat: -33.86, lng: 151.2, source: 'client' });
    expect(result.needsLocation).toBe(false);
  });

  it('resolveVisionLocation sets needsLocation when no EXIF or client GPS', async () => {
    vi.mocked(exifr.gps).mockResolvedValue(null);
    const result = await resolveVisionLocation({
      imageBuffers: [Buffer.from('stripped')],
      clientLocation: null,
    });
    expect(result.location).toBeNull();
    expect(result.needsLocation).toBe(true);
  });
});
