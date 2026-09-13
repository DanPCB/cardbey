import { describe, expect, it } from 'vitest';
import {
  formatPublicHoursDisplay,
  overlayPublicStoreFromCandidate,
} from '../overlayPublicStoreFromCandidate.js';

describe('formatPublicHoursDisplay', () => {
  it('returns trimmed strings', () => {
    expect(formatPublicHoursDisplay('  Mon–Fri 9–5  ')).toBe('Mon–Fri 9–5');
  });

  it('reads summary / weekday_text objects', () => {
    expect(formatPublicHoursDisplay({ summary: 'Open daily' })).toBe('Open daily');
    expect(formatPublicHoursDisplay({ weekday_text: ['Mon 9-5', 'Tue 9-5'] })).toBe(
      'Mon 9-5 · Tue 9-5',
    );
  });
});

describe('overlayPublicStoreFromCandidate', () => {
  it('fills null contact and hours from candidate without overwriting', () => {
    const publicStore = {
      name: 'Night Sky',
      contact: { phone: null, email: null, website: null, address: null },
      phone: null,
      description: null,
    };
    overlayPublicStoreFromCandidate(publicStore, {
      phone: '+84 123',
      website: 'https://nightsky.example',
      address: 'District 1',
      openingHours: '17:00–02:00',
      description: 'Rooftop bar in District 1.',
      socialLinks: [{ platform: 'instagram', url: 'https://instagram.com/nightsky' }],
    });
    expect(publicStore.contact.phone).toBe('+84 123');
    expect(publicStore.phone).toBe('+84 123');
    expect(publicStore.websiteUrl).toBe('https://nightsky.example');
    expect(publicStore.hours).toBe('17:00–02:00');
    expect(publicStore.description).toBe('Rooftop bar in District 1.');
    expect(publicStore.socialLinks.instagram).toBe('https://instagram.com/nightsky');
  });

  it('does not overwrite existing Business phone', () => {
    const publicStore = {
      contact: { phone: '111' },
      phone: '111',
    };
    overlayPublicStoreFromCandidate(publicStore, { phone: '222' });
    expect(publicStore.phone).toBe('111');
    expect(publicStore.contact.phone).toBe('111');
  });
});
