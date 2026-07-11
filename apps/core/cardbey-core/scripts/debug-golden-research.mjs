import { discoverBookwellVenueSource } from '../src/lib/storeCreationResearch/bookwellVenueDiscovery.js';

const source = await discoverBookwellVenueSource('Golden Nails', 'Heidelberg', 'Nail salon');
console.log('sourceUrl', source?.sourceUrl);
console.log('discoveryVia', source?.raw?.discoveryVia);
console.log('menuSourceUrl', source?.raw?.menuSourceUrl);
console.log('offerCount', source?.raw?.offers?.length);
console.log('sample', source?.raw?.offers?.slice(0, 8).map((o) => `${o.name} $${o.price}`));
