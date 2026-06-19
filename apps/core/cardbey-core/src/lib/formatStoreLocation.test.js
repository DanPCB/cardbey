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

  it('address without coordinates → Location not confirmed', () => {
    const label = formatFeedStoreLocationLabel({
      suburb: 'Melbourne',
      state: 'VIC',
      country: 'Australia',
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
