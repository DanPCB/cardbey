import { describe, expect, it } from 'vitest';
import {
  pickBestNamedVenue,
  venueNameMatchConfidence,
  websiteHostsMatch,
} from '../venueNameMatch.js';
import { buildPlacesProxyHeroUrl } from '../placesProxyHero.js';

describe('venueNameMatch', () => {
  it('scores Edoya vs Rex as a weak mismatch', () => {
    expect(
      venueNameMatchConfidence('Edoya Hotel Ben', 'Rex Hotel Rooftop Garden Bar'),
    ).toBeLessThan(0.85);
  });

  it('scores Edoya vs Edoya Hotel Ben Thanh as a strong match', () => {
    expect(
      venueNameMatchConfidence('Edoya Hotel Ben', 'Edoya Hotel Ben Thanh'),
    ).toBeGreaterThanOrEqual(0.85);
  });

  it('never picks results[0] without a strong name match', () => {
    const picked = pickBestNamedVenue(
      'Edoya Hotel Ben',
      [
        { id: 'rex', name: 'Rex Hotel Rooftop Garden Bar' },
        { id: 'edoya', name: 'Edoya Hotel Ben Thanh' },
      ],
      (r) => r.name,
    );
    expect(picked?.row.id).toBe('edoya');
  });

  it('returns null when only wrong venues exist', () => {
    expect(
      pickBestNamedVenue(
        'Edoya Hotel Ben',
        [{ name: 'Rex Hotel Rooftop Garden Bar' }],
        (r) => r.name,
      ),
    ).toBeNull();
  });

  it('matches website hosts ignoring www', () => {
    expect(websiteHostsMatch('https://www.edoyahotel.com', 'https://edoyahotel.com/rooms')).toBe(
      true,
    );
    expect(websiteHostsMatch('https://edoyahotel.com', 'https://rexhotel.com')).toBe(false);
  });
});

describe('buildPlacesProxyHeroUrl', () => {
  it('builds placeId-bound proxy URL from New Places photo name', () => {
    const built = buildPlacesProxyHeroUrl({
      placeId: 'ChIJedoya',
      rawSourceJson: {
        photos: [{ name: 'places/ChIJedoya/photos/ABC123' }],
      },
    });
    expect(built?.url).toContain('/api/public/places-photo?');
    expect(built?.url).toContain('placeId=ChIJedoya');
    expect(built?.url).toContain(encodeURIComponent('places/ChIJedoya/photos/ABC123'));
  });

  it('rejects photo names that embed a different placeId', () => {
    expect(
      buildPlacesProxyHeroUrl({
        placeId: 'ChIJedoya',
        rawSourceJson: {
          photos: [{ name: 'places/ChIJrex/photos/ABC123' }],
        },
      }),
    ).toBeNull();
  });
});
