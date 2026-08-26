const r = await fetch('https://awefinancial.com.au', {
  headers: { 'User-Agent': 'Mozilla/5.0 CardbeyDiag' },
});
const html = await r.text();
console.log('status', r.status, 'len', html.length);
const og = [...html.matchAll(/property=["']og:image["'][^>]*content=["']([^"']+)["']/gi)].map((m) => m[1]);
const og2 = [...html.matchAll(/content=["']([^"']+)["'][^>]*property=["']og:image["']/gi)].map((m) => m[1]);
console.log('og:image', [...og, ...og2].slice(0, 5));
console.log('mailto', [...html.matchAll(/mailto:([^"'>\s]+)/gi)].map((m) => m[1]).slice(0, 5));
console.log('tel', [...html.matchAll(/tel:([^"'>\s]+)/gi)].map((m) => m[1]).slice(0, 5));
console.log(
  'brochureSignals',
  /Barkly|0420|leo@|Footscray|Finance Broker|Empowering/i.test(html),
);
console.log('title', (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').slice(0, 120));
