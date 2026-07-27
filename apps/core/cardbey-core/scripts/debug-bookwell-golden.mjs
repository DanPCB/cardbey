const url = 'https://www.bookwell.com.au/venue/golden-nails-care-heidelberg/heidelberg/3084';
const html = await (await fetch(url, { headers: { 'User-Agent': 'Cardbey' } })).text();
const next = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
const cache = next?.props?.graphqlCache ?? {};

for (const [k, v] of Object.entries(cache)) {
  console.log('\n===', k, 'top keys', Object.keys(v?.data ?? v ?? {}));
  if (v?.data?.venue) {
    const venue = v.data.venue;
    console.log('venue name', venue.name, 'headings', venue.headings?.length);
  }
  if (v?.data?.category) console.log('category', v.data.category?.name);
  if (v?.data?.tag) console.log('tag', v.data.tag?.name, 'services', v.data.tag?.services?.length);
  // search for arrays with priced services
  const s = JSON.stringify(v);
  if (s.includes('priceTotal')) {
    const matches = [...s.matchAll(/"name":"([^"]+)","pricing":\{"priceModifiers":\[\],"priceTotal":\{"price":\{"format":"(\$[^"]+)"/g)];
    console.log('priced services in cache entry', matches.length);
    for (const m of matches.slice(0, 10)) console.log(' ', m[1], m[2]);
  }
}
