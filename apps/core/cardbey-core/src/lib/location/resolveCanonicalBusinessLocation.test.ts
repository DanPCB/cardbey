import { describe, it, expect } from 'vitest';
import {
  resolveCanonicalBusinessLocation,
  LOCATION_UNAVAILABLE_LABEL,
  DEMO_FALLBACK_LOCATION_NAMES,
} from './resolveCanonicalBusinessLocation.js';
import {
  applyCanonicalLocationToPreview,
  resolveAndApplyCanonicalLocationForDraft,
} from './applyCanonicalLocation.js';

describe('resolveCanonicalBusinessLocation', () => {
  it('manual: Create a bakery in Melbourne → city Melbourne, country Australia', () => {
    const loc = resolveCanonicalBusinessLocation({
      userPrompt: 'Create a bakery in Melbourne',
      locationText: 'Melbourne',
    });
    expect(loc.city?.toLowerCase()).toBe('melbourne');
    expect(loc.country).toBe('Australia');
    expect(loc.countryCode).toBe('AU');
    expect(loc.source).toMatch(/user_/);
  });

  it('manual: Create a cafe in Carlton → suburb Carlton, region VIC, country Australia', () => {
    const loc = resolveCanonicalBusinessLocation({
      userPrompt: 'Create a cafe in Carlton',
      locationText: 'Carlton',
    });
    expect(loc.suburb?.toLowerCase()).toBe('carlton');
    expect(loc.region).toBe('VIC');
    expect(loc.country).toBe('Australia');
  });

  it('seed: Brunetti Carlton → Carlton, VIC, Australia', () => {
    const loc = resolveCanonicalBusinessLocation({
      seed: {
        address: '380 Lygon Street, Carlton, VIC 3053, Australia',
        operatingRegion: 'AU-VIC',
      },
    });
    expect(loc.suburb?.toLowerCase()).toBe('carlton');
    expect(loc.region).toBe('VIC');
    expect(loc.country).toBe('Australia');
    expect(loc.source).toBe('seed_verified');
  });

  it("seed: Pellegrini's Espresso Bar → Melbourne, VIC, Australia", () => {
    const loc = resolveCanonicalBusinessLocation({
      seed: {
        address: "66 Bourke Street, Melbourne, VIC 3000, Australia",
        operatingRegion: 'AU-VIC',
      },
    });
    expect(loc.suburb?.toLowerCase() ?? loc.city?.toLowerCase()).toBe('melbourne');
    expect(loc.region).toBe('VIC');
    expect(loc.country).toBe('Australia');
  });

  it('service: Hair salon in Singapore → Singapore, Singapore', () => {
    const loc = resolveCanonicalBusinessLocation({
      userPrompt: 'Hair salon in Singapore',
      locationText: 'Singapore',
    });
    expect(loc.city?.toLowerCase() ?? loc.country?.toLowerCase()).toBe('singapore');
    expect(loc.country).toBe('Singapore');
    expect(loc.countryCode).toBe('SG');
  });

  it('returns Location unavailable when no source signal', () => {
    const loc = resolveCanonicalBusinessLocation({});
    expect(loc.displayLocation).toBe(LOCATION_UNAVAILABLE_LABEL);
    expect(loc.source).toBe('unavailable');
  });

  it('does not treat Austin as default without user input', () => {
    const loc = resolveCanonicalBusinessLocation({});
    expect(loc.displayLocation).not.toMatch(/austin/i);
    expect(DEMO_FALLBACK_LOCATION_NAMES.has('austin')).toBe(true);
  });
});

describe('applyCanonicalLocation guardrails', () => {
  it('LLM output cannot overwrite canonicalLocation in preview meta', () => {
    const { canonical, preview } = resolveAndApplyCanonicalLocationForDraft({
      draftInput: { location: 'Melbourne', prompt: 'Create a bakery in Melbourne' },
      preview: {
        location: 'Austin, TX',
        suburb: 'Downtown',
        country: 'United States',
      },
      trace: { missionId: 'm1', draftId: 'd1' },
    });
    expect(canonical.city?.toLowerCase()).toBe('melbourne');
    expect(preview.location).toBe(canonical.displayLocation);
    expect(preview.meta?.canonicalLocation?.displayLocation).toBe(canonical.displayLocation);
    expect(String(preview.location)).not.toMatch(/austin/i);
  });

  it('publish path keeps canonical suburb when generated differs', () => {
    const canonical = resolveCanonicalBusinessLocation({
      locationText: 'Carlton',
      userPrompt: 'Create a cafe in Carlton',
    });
    const preview = applyCanonicalLocationToPreview(
      { location: 'Singapore', suburb: 'Central', country: 'Singapore' },
      canonical,
      { draftId: 'd2' },
    );
    expect(preview.suburb?.toLowerCase()).toBe('carlton');
    expect(String(preview.location)).not.toMatch(/singapore/i);
  });

  it('feed/store parity: same resolver for draft input and preview', () => {
    const input = {
      location: 'Melbourne',
      prompt: 'Bakery in Melbourne',
    };
    const a = resolveCanonicalBusinessLocation({
      userPrompt: input.prompt,
      locationText: input.location,
    });
    const { canonical: b } = resolveAndApplyCanonicalLocationForDraft({
      draftInput: input,
      preview: {},
    });
    expect(b.displayLocation).toBe(a.displayLocation);
    expect(b.country).toBe(a.country);
  });
});
