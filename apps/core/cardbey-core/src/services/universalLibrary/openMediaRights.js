/**
 * Fail-closed open-media licence classification for Federation → UL intake.
 * Does not replace Rights Intelligence — only gates publish eligibility.
 */

import { RIGHTS_STATUS } from './universalAssetTypes.js';

/**
 * @param {string} licenseRaw
 * @returns {{ rightsStatus: string, reusable: boolean, normalized: string }}
 */
export function classifyOpenMediaLicense(licenseRaw) {
  const raw = String(licenseRaw || '').trim();
  if (!raw) {
    return { rightsStatus: RIGHTS_STATUS.UNKNOWN, reusable: false, normalized: '' };
  }

  const n = raw
    .toLowerCase()
    .replace(/https?:\/\/creativecommons\.org\/licenses\//g, '')
    .replace(/[_/]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    n === 'cc0' ||
    n.startsWith('cc0-') ||
    n === 'pdm' ||
    n.includes('public-domain') ||
    n.includes('public domain')
  ) {
    return { rightsStatus: RIGHTS_STATUS.CLEARED, reusable: true, normalized: raw };
  }

  if (n.includes('pexels license')) {
    return { rightsStatus: RIGHTS_STATUS.CLEARED, reusable: true, normalized: 'Pexels License' };
  }

  // Explicitly blocked classes
  if (
    /\bnc\b|non-commercial|noncommercial|\bnd\b|no-deriv|noderiv|all-rights-reserved/.test(n)
  ) {
    return { rightsStatus: RIGHTS_STATUS.RESTRICTED, reusable: false, normalized: raw };
  }

  // Openverse short codes + CC BY / BY-SA
  if (
    n === 'by-sa' ||
    n.startsWith('by-sa-') ||
    n.includes('cc-by-sa') ||
    /\bcc by-sa\b/.test(n) ||
    /\bcc by sa\b/.test(n)
  ) {
    return { rightsStatus: RIGHTS_STATUS.CLEARED, reusable: true, normalized: raw };
  }

  if (n === 'by' || n.startsWith('by-') || n.includes('cc-by') || /\bcc by\b/.test(n)) {
    return { rightsStatus: RIGHTS_STATUS.CLEARED, reusable: true, normalized: raw };
  }

  return { rightsStatus: RIGHTS_STATUS.UNKNOWN, reusable: false, normalized: raw };
}
