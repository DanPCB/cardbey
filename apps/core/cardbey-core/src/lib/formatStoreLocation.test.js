/**
 * formatStoreLocation confidence-aware labels
 */

import { describe, it, expect } from 'vitest';
import {
  formatFeedStoreLocationLabel,
  hasConfirmedStoreCoordinates,
  LOCATION_NOT_CONFIRMED_LABEL,
} from './formatStoreLocation.js';

describe('formatStoreLocation confidence', () => {
  it('confirmed coordinates produce compact suburb label', () => {
    const label = formatFeedStoreLocationLabel({
      suburb: 'Carlton',
      state: 'VIC',
      lat: -37.8,
      lng: 144.96,
      locationConfidence: 'confirmed',
    });
    expect(label).toBe('Carlton, VIC');
  });

  it('city/suburb text shows even when confidence is unconfirmed (pre-geocode)', () => {
    const label = formatFeedStoreLocationLabel({
      suburb: 'Melbourne',
      state: 'VIC',
      country: 'Australia',
      locationConfidence: 'unconfirmed',
    });
    expect(label).toBe('Melbourne, VIC');
  });

  it('city-only intake shows city (not Location not confirmed)', () => {
    const label = formatFeedStoreLocationLabel({
      city: 'Melbourne',
      country: 'Australia',
      locationConfidence: 'unconfirmed',
    });
    expect(label).toBe('Melbourne');
  });

  it('coordinates-only without locality → Location not confirmed', () => {
    const label = formatFeedStoreLocationLabel({
      lat: -37.8,
      lng: 144.96,
      locationConfidence: 'unconfirmed',
    });
    expect(label).toBe(LOCATION_NOT_CONFIRMED_LABEL);
  });

  it('hasConfirmedStoreCoordinates rejects low confidence', () => {
    expect(
      hasConfirmedStoreCoordinates({
        lat: -37.8,
        lng: 144.96,
        locationConfidence: 'low',
      }),
    ).toBe(false);
  });
});
