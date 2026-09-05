/**
 * Australia territory registry — configured coverage only (not nationwide complete).
 * Melbourne maps to existing pilot without rewriting MELBOURNE_BATCH001_* batch IDs.
 */

import type { TerritoryRecord } from './types.js';

const AU: TerritoryRecord['countryCode'] = 'AU';

function t(
  partial: Omit<TerritoryRecord, 'countryCode' | 'active' | 'aliases'> & {
    aliases?: string[];
    active?: boolean;
  },
): TerritoryRecord {
  return {
    countryCode: AU,
    active: partial.active !== false,
    aliases: partial.aliases ?? [],
    ...partial,
  };
}

/** Priority 1 — Melbourne metro (preserves real-local pilot geography). */
export const AU_MELBOURNE_LOCALITIES: TerritoryRecord[] = [
  t({
    id: 'au-vic-melbourne',
    kind: 'city',
    parentId: 'au-vic',
    name: 'Melbourne',
    regionCode: 'VIC',
    priorityGroup: 1,
    aliases: ['melbourne', 'melb', 'greater melbourne'],
    bbox: [144.4, -38.2, 145.5, -37.5],
    defaultRadiusM: 25000,
  }),
  t({
    id: 'au-vic-melbourne-braybrook',
    kind: 'suburb',
    parentId: 'au-vic-melbourne',
    name: 'Braybrook',
    regionCode: 'VIC',
    priorityGroup: 1,
    aliases: ['braybrook'],
  }),
  t({
    id: 'au-vic-melbourne-sunshine',
    kind: 'suburb',
    parentId: 'au-vic-melbourne',
    name: 'Sunshine',
    regionCode: 'VIC',
    priorityGroup: 1,
    aliases: ['sunshine', 'sunshine vic'],
  }),
  t({
    id: 'au-vic-melbourne-sunshine-north',
    kind: 'suburb',
    parentId: 'au-vic-melbourne',
    name: 'Sunshine North',
    regionCode: 'VIC',
    priorityGroup: 1,
    aliases: ['sunshine north'],
  }),
  t({
    id: 'au-vic-melbourne-st-albans',
    kind: 'suburb',
    parentId: 'au-vic-melbourne',
    name: 'St Albans',
    regionCode: 'VIC',
    priorityGroup: 1,
    aliases: ['st albans', 'saint albans'],
  }),
  t({
    id: 'au-vic-melbourne-footscray',
    kind: 'suburb',
    parentId: 'au-vic-melbourne',
    name: 'Footscray',
    regionCode: 'VIC',
    priorityGroup: 1,
    aliases: ['footscray'],
  }),
];

export const AU_TERRITORIES: TerritoryRecord[] = [
  t({
    id: 'au',
    kind: 'country',
    parentId: null,
    name: 'Australia',
    regionCode: null,
    priorityGroup: 99,
    aliases: ['australia', 'au', 'aus'],
  }),
  t({ id: 'au-vic', kind: 'state', parentId: 'au', name: 'Victoria', regionCode: 'VIC', priorityGroup: 1, aliases: ['vic', 'victoria'] }),
  t({ id: 'au-nsw', kind: 'state', parentId: 'au', name: 'New South Wales', regionCode: 'NSW', priorityGroup: 2, aliases: ['nsw', 'new south wales'] }),
  t({ id: 'au-qld', kind: 'state', parentId: 'au', name: 'Queensland', regionCode: 'QLD', priorityGroup: 3, aliases: ['qld', 'queensland'] }),
  t({ id: 'au-wa', kind: 'state', parentId: 'au', name: 'Western Australia', regionCode: 'WA', priorityGroup: 4, aliases: ['wa', 'western australia'] }),
  t({ id: 'au-sa', kind: 'state', parentId: 'au', name: 'South Australia', regionCode: 'SA', priorityGroup: 5, aliases: ['sa', 'south australia'] }),
  t({ id: 'au-act', kind: 'territory', parentId: 'au', name: 'Australian Capital Territory', regionCode: 'ACT', priorityGroup: 6, aliases: ['act', 'canberra territory'] }),
  t({ id: 'au-tas', kind: 'state', parentId: 'au', name: 'Tasmania', regionCode: 'TAS', priorityGroup: 7, aliases: ['tas', 'tasmania'] }),
  t({ id: 'au-nt', kind: 'territory', parentId: 'au', name: 'Northern Territory', regionCode: 'NT', priorityGroup: 8, aliases: ['nt', 'northern territory'] }),

  // Priority cities
  t({ id: 'au-nsw-sydney', kind: 'city', parentId: 'au-nsw', name: 'Sydney', regionCode: 'NSW', priorityGroup: 2, aliases: ['sydney'], bbox: [150.5, -34.2, 151.4, -33.5], defaultRadiusM: 25000 }),
  t({ id: 'au-qld-brisbane', kind: 'city', parentId: 'au-qld', name: 'Brisbane', regionCode: 'QLD', priorityGroup: 3, aliases: ['brisbane'], bbox: [152.8, -27.7, 153.3, -27.2], defaultRadiusM: 25000 }),
  t({ id: 'au-wa-perth', kind: 'city', parentId: 'au-wa', name: 'Perth', regionCode: 'WA', priorityGroup: 4, aliases: ['perth'], bbox: [115.6, -32.2, 116.1, -31.7], defaultRadiusM: 25000 }),
  t({ id: 'au-sa-adelaide', kind: 'city', parentId: 'au-sa', name: 'Adelaide', regionCode: 'SA', priorityGroup: 5, aliases: ['adelaide'], bbox: [138.4, -35.1, 138.8, -34.7], defaultRadiusM: 20000 }),
  t({ id: 'au-act-canberra', kind: 'city', parentId: 'au-act', name: 'Canberra', regionCode: 'ACT', priorityGroup: 6, aliases: ['canberra'], bbox: [149.0, -35.5, 149.2, -35.2], defaultRadiusM: 15000 }),
  t({ id: 'au-tas-hobart', kind: 'city', parentId: 'au-tas', name: 'Hobart', regionCode: 'TAS', priorityGroup: 7, aliases: ['hobart'], bbox: [147.2, -43.0, 147.5, -42.8], defaultRadiusM: 15000 }),
  t({ id: 'au-nt-darwin', kind: 'city', parentId: 'au-nt', name: 'Darwin', regionCode: 'NT', priorityGroup: 8, aliases: ['darwin'], bbox: [130.8, -12.5, 131.0, -12.3], defaultRadiusM: 15000 }),

  // Priority 9 — major regional centres (sample configured set)
  t({ id: 'au-nsw-newcastle', kind: 'city', parentId: 'au-nsw', name: 'Newcastle', regionCode: 'NSW', priorityGroup: 9, aliases: ['newcastle'] }),
  t({ id: 'au-nsw-wollongong', kind: 'city', parentId: 'au-nsw', name: 'Wollongong', regionCode: 'NSW', priorityGroup: 9, aliases: ['wollongong'] }),
  t({ id: 'au-qld-gold-coast', kind: 'city', parentId: 'au-qld', name: 'Gold Coast', regionCode: 'QLD', priorityGroup: 9, aliases: ['gold coast'] }),
  t({ id: 'au-qld-cairns', kind: 'city', parentId: 'au-qld', name: 'Cairns', regionCode: 'QLD', priorityGroup: 9, aliases: ['cairns'] }),
  t({ id: 'au-qld-townsville', kind: 'city', parentId: 'au-qld', name: 'Townsville', regionCode: 'QLD', priorityGroup: 9, aliases: ['townsville'] }),
  t({ id: 'au-vic-geelong', kind: 'city', parentId: 'au-vic', name: 'Geelong', regionCode: 'VIC', priorityGroup: 9, aliases: ['geelong'] }),
  t({ id: 'au-vic-ballarat', kind: 'city', parentId: 'au-vic', name: 'Ballarat', regionCode: 'VIC', priorityGroup: 9, aliases: ['ballarat'] }),
  t({ id: 'au-wa-bunbury', kind: 'city', parentId: 'au-wa', name: 'Bunbury', regionCode: 'WA', priorityGroup: 9, aliases: ['bunbury'] }),
  t({ id: 'au-sa-mount-gambier', kind: 'city', parentId: 'au-sa', name: 'Mount Gambier', regionCode: 'SA', priorityGroup: 9, aliases: ['mount gambier'] }),

  // Priority 10 — locality/postcode clusters (configured sample)
  t({ id: 'au-nsw-sydney-parramatta', kind: 'locality', parentId: 'au-nsw-sydney', name: 'Parramatta', regionCode: 'NSW', priorityGroup: 10, aliases: ['parramatta'] }),
  t({ id: 'au-nsw-sydney-chatswood', kind: 'locality', parentId: 'au-nsw-sydney', name: 'Chatswood', regionCode: 'NSW', priorityGroup: 10, aliases: ['chatswood'] }),
  t({ id: 'au-nsw-sydney-blacktown', kind: 'suburb', parentId: 'au-nsw-sydney', name: 'Blacktown', regionCode: 'NSW', priorityGroup: 10, aliases: ['blacktown'] }),
  t({ id: 'au-nsw-sydney-penrith', kind: 'suburb', parentId: 'au-nsw-sydney', name: 'Penrith', regionCode: 'NSW', priorityGroup: 10, aliases: ['penrith'] }),
  t({ id: 'au-nsw-sydney-liverpool', kind: 'suburb', parentId: 'au-nsw-sydney', name: 'Liverpool', regionCode: 'NSW', priorityGroup: 10, aliases: ['liverpool'] }),
  t({ id: 'au-nsw-sydney-bondi', kind: 'suburb', parentId: 'au-nsw-sydney', name: 'Bondi', regionCode: 'NSW', priorityGroup: 10, aliases: ['bondi'] }),
  t({ id: 'au-nsw-sydney-surry-hills', kind: 'suburb', parentId: 'au-nsw-sydney', name: 'Surry Hills', regionCode: 'NSW', priorityGroup: 10, aliases: ['surry hills'] }),
  t({ id: 'au-qld-brisbane-south-bank', kind: 'locality', parentId: 'au-qld-brisbane', name: 'South Bank', regionCode: 'QLD', priorityGroup: 10, aliases: ['south bank', 'southbank'] }),
  t({ id: 'au-qld-brisbane-chermside', kind: 'suburb', parentId: 'au-qld-brisbane', name: 'Chermside', regionCode: 'QLD', priorityGroup: 10, aliases: ['chermside'] }),
  t({ id: 'au-qld-brisbane-logan', kind: 'suburb', parentId: 'au-qld-brisbane', name: 'Logan', regionCode: 'QLD', priorityGroup: 10, aliases: ['logan', 'logan city'] }),
  t({ id: 'au-qld-brisbane-ipswich', kind: 'suburb', parentId: 'au-qld-brisbane', name: 'Ipswich', regionCode: 'QLD', priorityGroup: 10, aliases: ['ipswich'] }),
  t({ id: 'au-wa-perth-fremantle', kind: 'locality', parentId: 'au-wa-perth', name: 'Fremantle', regionCode: 'WA', priorityGroup: 10, aliases: ['fremantle'] }),
  t({ id: 'au-wa-perth-joondalup', kind: 'suburb', parentId: 'au-wa-perth', name: 'Joondalup', regionCode: 'WA', priorityGroup: 10, aliases: ['joondalup'] }),
  t({ id: 'au-wa-perth-rockingham', kind: 'suburb', parentId: 'au-wa-perth', name: 'Rockingham', regionCode: 'WA', priorityGroup: 10, aliases: ['rockingham'] }),
  t({ id: 'au-sa-adelaide-glenelg', kind: 'suburb', parentId: 'au-sa-adelaide', name: 'Glenelg', regionCode: 'SA', priorityGroup: 10, aliases: ['glenelg'] }),
  t({ id: 'au-sa-adelaide-norwood', kind: 'suburb', parentId: 'au-sa-adelaide', name: 'Norwood', regionCode: 'SA', priorityGroup: 10, aliases: ['norwood'] }),
  t({ id: 'au-sa-adelaide-prospect', kind: 'suburb', parentId: 'au-sa-adelaide', name: 'Prospect', regionCode: 'SA', priorityGroup: 10, aliases: ['prospect'] }),
  t({ id: 'au-tas-hobart-launceston', kind: 'city', parentId: 'au-tas', name: 'Launceston', regionCode: 'TAS', priorityGroup: 10, aliases: ['launceston'] }),
  t({ id: 'au-tas-hobart-devonport', kind: 'city', parentId: 'au-tas', name: 'Devonport', regionCode: 'TAS', priorityGroup: 10, aliases: ['devonport'] }),
  t({ id: 'au-nt-darwin-palmerston', kind: 'suburb', parentId: 'au-nt-darwin', name: 'Palmerston', regionCode: 'NT', priorityGroup: 10, aliases: ['palmerston'] }),
  t({ id: 'au-act-canberra-belconnen', kind: 'suburb', parentId: 'au-act-canberra', name: 'Belconnen', regionCode: 'ACT', priorityGroup: 10, aliases: ['belconnen'] }),
  t({ id: 'au-act-canberra-tuggeranong', kind: 'suburb', parentId: 'au-act-canberra', name: 'Tuggeranong', regionCode: 'ACT', priorityGroup: 10, aliases: ['tuggeranong'] }),
  t({ id: 'au-vic-melbourne-dandenong', kind: 'suburb', parentId: 'au-vic-melbourne', name: 'Dandenong', regionCode: 'VIC', priorityGroup: 10, aliases: ['dandenong'] }),
  t({ id: 'au-vic-melbourne-box-hill', kind: 'suburb', parentId: 'au-vic-melbourne', name: 'Box Hill', regionCode: 'VIC', priorityGroup: 10, aliases: ['box hill'] }),
  t({ id: 'au-vic-melbourne-richmond', kind: 'suburb', parentId: 'au-vic-melbourne', name: 'Richmond', regionCode: 'VIC', priorityGroup: 10, aliases: ['richmond'] }),
  t({ id: 'au-vic-melbourne-st-kilda', kind: 'suburb', parentId: 'au-vic-melbourne', name: 'St Kilda', regionCode: 'VIC', priorityGroup: 10, aliases: ['st kilda', 'saint kilda'] }),

  ...AU_MELBOURNE_LOCALITIES,
];

/** Map legacy Melbourne pilot suburb names → territory ids. */
export const MELBOURNE_PILOT_SUBURB_TO_TERRITORY: Record<string, string> = {
  Braybrook: 'au-vic-melbourne-braybrook',
  Sunshine: 'au-vic-melbourne-sunshine',
  'Sunshine North': 'au-vic-melbourne-sunshine-north',
  'St Albans': 'au-vic-melbourne-st-albans',
  Footscray: 'au-vic-melbourne-footscray',
};
