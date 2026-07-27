import { extractOffersFromBookwellHtml } from '../src/lib/storeCreationResearch/bookwellVenueDiscovery.js';

const url = 'https://www.bookwell.com.au/venue/glamshell-beauty/williamstown/3016';
const html = await (await fetch(url, { headers: { 'User-Agent': 'Cardbey' } })).text();
const offers = extractOffersFromBookwellHtml(html);
console.log('h3 offers', offers.length);

const next = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
const venue = Object.values(next.props.graphqlCache).find((v) => v?.data?.venue)?.data?.venue;
const jsonOffers = (venue.headings ?? []).flatMap((h) => h.services ?? []).filter(
  (s) => s.pricing?.priceTotal?.price?.format,
);
console.log('json offers', jsonOffers.length);
