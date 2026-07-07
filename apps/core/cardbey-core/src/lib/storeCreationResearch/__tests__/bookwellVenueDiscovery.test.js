import { describe, expect, it } from 'vitest';
import {
  slugifyBusinessName,
  venueSlugMatchesName,
  findBookwellVenueInListingHtml,
  extractOffersFromBookwellHtml,
  isBeautyBookingCategory,
  bookwellLocationSlug,
} from '../bookwellVenueDiscovery.js';

const GLAMSHELL_LISTING_SNIPPET = `
<h2>Glamshell Beauty</h2>
<p>63 Ferguson Street, Williamstown 3016</p>
<a href="https://www.bookwell.com.au/venue/glamshell-beauty/williamstown/3016">Book online</a>
`;

const GLAMSHELL_VENUE_SNIPPET = `
<h1>Glamshell Beauty</h1>
<p>63 Ferguson Street Williamstown 3016</p>
<h3>SNS (on natural nails)</h3>
<p>40 min</p>
<p>$40.00</p>
<h3>Pedicure with Shellac</h3>
<p>1 hour</p>
<p>$40.00</p>
<h3>Eyelash Extensions</h3>
<p>1 hour 30 min</p>
<p>$80.00</p>
`;

describe('bookwellVenueDiscovery', () => {
  it('slugifies business names for venue URLs', () => {
    expect(slugifyBusinessName('Glamshell Beauty')).toBe('glamshell-beauty');
  });

  it('maps Melbourne location to bookwell slug', () => {
    expect(bookwellLocationSlug('Melbourne, VIC')).toBe('melbourne');
  });

  it('detects beauty categories', () => {
    expect(isBeautyBookingCategory('Beauty', 'Glamshell Beauty')).toBe(true);
    expect(isBeautyBookingCategory('Restaurant', 'Harbour Cafe')).toBe(false);
  });

  it('matches venue slug to business name', () => {
    expect(venueSlugMatchesName('Glamshell Beauty', 'glamshell-beauty')).toBe(true);
    expect(venueSlugMatchesName('Glamshell Beauty', 'other-salon')).toBe(false);
  });

  it('finds venue URL in Bookwell listing HTML', () => {
    const url = findBookwellVenueInListingHtml(GLAMSHELL_LISTING_SNIPPET, 'Glamshell Beauty');
    expect(url).toBe('https://www.bookwell.com.au/venue/glamshell-beauty/williamstown/3016');
  });

  it('extracts priced services from Bookwell venue HTML', () => {
    const offers = extractOffersFromBookwellHtml(GLAMSHELL_VENUE_SNIPPET);
    expect(offers.length).toBeGreaterThanOrEqual(3);
    expect(offers.find((o) => /sns/i.test(o.name))?.price).toBe(40);
    expect(offers.find((o) => /pedicure/i.test(o.name))?.durationMinutes).toBe(60);
    expect(offers.find((o) => /eyelash/i.test(o.name))?.price).toBe(80);
  });
});
