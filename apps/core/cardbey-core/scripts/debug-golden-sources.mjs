import { extractOffersFromBookwellHtml } from '../src/lib/storeCreationResearch/bookwellVenueDiscovery.js';

const urls = [
  'https://www.bookwell.com.au/venue/golden-nails-care-heidelberg/heidelberg/3084',
  'https://www.bookwell.com.au/venue/golden-nails-care-south-yarra/south-yarra/3141',
  'https://www.bookwell.com.au/venue/golden-nails-care-melbourne/melbourne/3000',
  'https://www.bookwell.com.au/venue/golden-nails-care-prahran/prahran/3181',
];

for (const url of urls) {
  const html = await (await fetch(url, { headers: { 'User-Agent': 'Cardbey' } })).text();
  const next = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const venue = Object.values(next.props.graphqlCache).find((v) => v?.data?.venue)?.data?.venue;
  const jsonCount = (venue?.headings ?? []).reduce((n, h) => n + h.services.length, 0);
  const h3Count = extractOffersFromBookwellHtml(html).length;
  console.log(url.split('/venue/')[1], 'name', venue?.name, 'json', jsonCount, 'h3', h3Count, 'migrated', venue?.migratedToFresha);
}
