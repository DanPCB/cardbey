import { describe, expect, it } from 'vitest';
import {
  slugifyBusinessName,
  venueSlugMatchesName,
  findBookwellVenueInListingHtml,
  findAllBookwellVenuesInListingHtml,
  extractOffersFromBookwellHtml,
  extractOffersFromBookwellNextData,
  bookwellVenueBrandSlug,
  buildBookwellSiblingVenueUrls,
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

const GOLDEN_NEXT_DATA_SNIPPET = `
<script id="__NEXT_DATA__" type="application/json">{
  "props": {
    "graphqlCache": {
      "venue": {
        "data": {
          "venue": {
            "name": "Golden Nails Care - South Yarra",
            "displayAddress": "7 / 450 Chapel Street",
            "migratedToFresha": false,
            "freshaUrl": null,
            "headings": [
              {
                "name": "Manicure",
                "services": [
                  {
                    "name": "Basic Manicure + Pedicure",
                    "duration": 45,
                    "description": "",
                    "pricing": { "priceTotal": { "price": { "format": "$55.00" } } }
                  },
                  {
                    "name": "SNS Nails - Overlay (Dipping Powder)",
                    "duration": 30,
                    "description": "On the real nail",
                    "pricing": { "priceTotal": { "price": { "format": "$50.00" } } }
                  }
                ]
              },
              {
                "name": "Waxing",
                "services": [
                  {
                    "name": "Ladies Waxing - Eyebrows",
                    "duration": 15,
                    "pricing": { "priceTotal": { "price": { "format": "$20.00" } } }
                  }
                ]
              }
            ]
          }
        }
      }
    }
  }
}</script>
`;

describe('bookwellVenueDiscovery', () => {
  it('slugifies business names for venue URLs', () => {
    expect(slugifyBusinessName('Glamshell Beauty')).toBe('glamshell-beauty');
    expect(slugifyBusinessName('Golden Nails Care')).toBe('golden-nails-care');
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
    expect(venueSlugMatchesName('Golden Nails', 'golden-nails-care-south-yarra')).toBe(true);
    expect(venueSlugMatchesName('Glamshell Beauty', 'other-salon')).toBe(false);
  });

  it('derives brand slug for sibling venue probing', () => {
    expect(bookwellVenueBrandSlug('Golden Nails Care', 'golden-nails-care-heidelberg')).toBe(
      'golden-nails-care',
    );
    expect(bookwellVenueBrandSlug('Golden Nails', 'golden-nails-care-heidelberg')).toBe(
      'golden-nails-care',
    );
    expect(buildBookwellSiblingVenueUrls(
      'Golden Nails',
      'https://www.bookwell.com.au/venue/golden-nails-care-heidelberg/heidelberg/3084',
    )).toContain(
      'https://www.bookwell.com.au/venue/golden-nails-care-south-yarra/south-yarra/3141',
    );
  });

  it('finds venue URL in Bookwell listing HTML', () => {
    const url = findBookwellVenueInListingHtml(GLAMSHELL_LISTING_SNIPPET, 'Glamshell Beauty');
    expect(url).toBe('https://www.bookwell.com.au/venue/glamshell-beauty/williamstown/3016');
    expect(findAllBookwellVenuesInListingHtml(GLAMSHELL_LISTING_SNIPPET, 'Glamshell Beauty')).toEqual([
      'https://www.bookwell.com.au/venue/glamshell-beauty/williamstown/3016',
    ]);
  });

  it('extracts priced services from Bookwell venue HTML', () => {
    const offers = extractOffersFromBookwellHtml(GLAMSHELL_VENUE_SNIPPET);
    expect(offers.length).toBeGreaterThanOrEqual(3);
    expect(offers.find((o) => /sns/i.test(o.name))?.price).toBe(40);
    expect(offers.find((o) => /pedicure/i.test(o.name))?.durationMinutes).toBe(60);
    expect(offers.find((o) => /eyelash/i.test(o.name))?.price).toBe(80);
  });

  it('extracts priced services from Bookwell __NEXT_DATA__ graphql cache', () => {
    const offers = extractOffersFromBookwellNextData(GOLDEN_NEXT_DATA_SNIPPET);
    expect(offers).toHaveLength(3);
    expect(offers.find((o) => /basic manicure/i.test(o.name))?.price).toBe(55);
    expect(offers.find((o) => /sns/i.test(o.name))?.durationMinutes).toBe(30);
    expect(offers.find((o) => /eyebrows/i.test(o.name))?.price).toBe(20);
  });

  it('prefers embedded Bookwell JSON services over sparse HTML-only rows', () => {
    const html = `${GOLDEN_NEXT_DATA_SNIPPET}
      <h3>Basic Manicure + Pedicure</h3><p>$55.00</p>`;
    const offers = extractOffersFromBookwellHtml(html);
    expect(offers.length).toBe(3);
  });
});
