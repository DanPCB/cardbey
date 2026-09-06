import assert from 'node:assert/strict';
import {
  isGenericBusinessName,
  namesLikelyMatch,
  addressMatchesExpectedLocation,
  pickBestPlaceCandidate,
} from '../lib/googlePlacesBackfillMatch.mjs';

assert.equal(namesLikelyMatch('Pho Ngon Braybrook', 'Pho Ngon Braybrook'), true);
assert.equal(namesLikelyMatch('Galaxsigns', 'Galaxsigns'), true);
assert.equal(namesLikelyMatch('TG Hydroponics', 'TG Hydroponics'), true);
assert.equal(namesLikelyMatch('Banh my Nhu Lan', 'Nhu Lan Bakery'), true);
assert.equal(namesLikelyMatch('Cố Đô Shunshine', 'Co Do'), true);
assert.equal(namesLikelyMatch('Brunetti Carlton', 'Brunetti Classico Carlton'), true);

assert.equal(namesLikelyMatch('Pho Ngon Footscray', 'Pho Hung Vuong Saigon'), false);
assert.equal(namesLikelyMatch('WonderLand homestay', 'Wonderland Cat Hotel'), false);
assert.equal(namesLikelyMatch('Spring Collection', 'Myer Melbourne'), false);
assert.equal(namesLikelyMatch('Anison Capital Group', 'Caason Group'), false);
assert.equal(namesLikelyMatch('BB Flowers', 'The Beautiful Bunch'), false);
assert.equal(namesLikelyMatch('Fashion store', 'Le Style Boutique'), false);
assert.equal(namesLikelyMatch('Prime Epoxy', 'Premium Epoxy Coatings'), false);
assert.equal(namesLikelyMatch('Herbal Head Spa', 'The Head Spa by Hikari'), false);
assert.equal(namesLikelyMatch('Another Fashion', 'RetroStar Vintage Clothing'), false);
assert.equal(namesLikelyMatch('ABC Fashion', 'ABC Costumes & Knox Dancewear'), false);

assert.equal(isGenericBusinessName('Spring Collection'), true);
assert.equal(isGenericBusinessName('My Fashion'), true);
assert.equal(isGenericBusinessName('Fashion store'), true);
assert.equal(isGenericBusinessName('Galaxsigns'), false);

assert.equal(
  addressMatchesExpectedLocation('128 Hopkins St, Footscray VIC 3011, Australia', {
    slug: 'pho-ngon-footscray',
    suburb: 'Melbourne',
    country: 'AU',
  }),
  true,
);
assert.equal(
  addressMatchesExpectedLocation('Unit 43/68-78 Rosebank Ave, Clayton South VIC 3169, Australia', {
    slug: 'wonderland-homestay',
    suburb: 'Melbourne',
    country: 'AU',
  }),
  true,
); // slug has no place hint — location alone ok; name gate rejects

assert.equal(
  pickBestPlaceCandidate('Pho Ngon Footscray', [
    { name: 'Pho Hung Vuong Saigon', place_id: 'a' },
    { name: 'Pho Ngon Footscray', place_id: 'b' },
  ])?.place_id,
  'b',
);

console.log('googlePlacesBackfillMatch: ok');
