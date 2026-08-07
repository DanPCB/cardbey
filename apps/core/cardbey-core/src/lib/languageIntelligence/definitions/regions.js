/**
 * Seed region profiles.
 */

/** @type {import('../contracts/regionProfile.js').RegionProfile[]} */
export const REGION_DEFINITIONS = Object.freeze([
  {
    id: 'VN',
    version: 1,
    name: 'Vietnam',
    defaultLanguage: 'vi',
    currency: 'VND',
    dateFormat: 'dd/MM/yyyy',
    measurementUnits: 'metric',
    communicationStyle: 'polite',
    intlLocale: 'vi-VN',
  },
  {
    id: 'AU',
    version: 1,
    name: 'Australia',
    defaultLanguage: 'en',
    currency: 'AUD',
    dateFormat: 'dd/MM/yyyy',
    measurementUnits: 'metric',
    communicationStyle: 'friendly',
    intlLocale: 'en-AU',
  },
  {
    id: 'US',
    version: 1,
    name: 'United States',
    defaultLanguage: 'en',
    currency: 'USD',
    dateFormat: 'MM/dd/yyyy',
    measurementUnits: 'imperial',
    communicationStyle: 'direct',
    intlLocale: 'en-US',
  },
  {
    id: 'JP',
    version: 1,
    name: 'Japan',
    defaultLanguage: 'ja',
    currency: 'JPY',
    dateFormat: 'yyyy/MM/dd',
    measurementUnits: 'metric',
    communicationStyle: 'formal',
    intlLocale: 'ja-JP',
  },
  {
    id: 'DE',
    version: 1,
    name: 'Germany',
    defaultLanguage: 'de',
    currency: 'EUR',
    dateFormat: 'dd.MM.yyyy',
    measurementUnits: 'metric',
    communicationStyle: 'structured',
    intlLocale: 'de-DE',
  },
]);
