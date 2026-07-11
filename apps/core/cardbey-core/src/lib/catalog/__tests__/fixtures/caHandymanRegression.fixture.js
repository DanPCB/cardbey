/**
 * CA Handyman regression fixture and shared test helpers.
 */

import { resolveCommerceProfile } from '../../../commerce/resolveCommerceProfile.js';
import { buildIndustryCatalog } from '../../../../services/draftStore/industryBlueprintRegistry.js';
import { compileCatalogForStore } from '../../catalogCompiler.js';
import { evaluateServiceMismatchGuard } from '../../../../services/media/serviceImageMismatchGuards.js';
import { buildServiceImageIntent } from '../../../../services/media/serviceImageIntentResolver.js';
import { scoreServiceImageCandidateMetadata } from '../../../../services/media/serviceImageCandidateScorer.js';
import { assertCatalogKindConsistency } from '../../../commerce/assertCatalogKindConsistency.js';
import { runSemanticCatalogQa } from '../../../../services/qa/semanticCatalogQa.js';

export const CA_HANDYMAN_CTX = {
  businessName: 'CA Handyman',
  storeType: 'handyman',
  businessType: 'handyman',
  verticalSlug: 'services.handyman',
  verticalGroup: 'services',
  location: 'Melbourne VIC Australia',
  currencyCode: 'AUD',
};

export const IMAGE_MISMATCH_CASES = [
  { service: 'Door Repair', candidateText: 'bicycle repair mechanic workshop', reject: true },
  { service: 'Fence Repair', candidateText: 'person washing hands under tap sink', reject: true },
  { service: 'Deck Maintenance', candidateText: 'welding factory sparks', reject: true },
  { service: 'Tile Repair', candidateText: 'woman office shelving bookshelf', reject: true },
  { service: 'Flyscreen Repair', candidateText: 'business meeting conference table', reject: true },
  { service: 'TV Wall Mounting', candidateText: 'air vent HVAC grille ceiling', reject: true },
  { service: 'Cabinet Installation', candidateText: 'plumbing valve tap fitting', reject: true },
  { service: 'Shelf Installation', candidateText: 'drain gutter leaves outdoor pipe', reject: true },
  { service: 'Window Cleaning', candidateText: 'drill bit woodworking', reject: true },
  { service: 'Pressure Washing', candidateText: 'road maintenance truck asphalt', reject: true },
  { service: 'Gutter Cleaning', candidateText: 'indoor cabinet wardrobe', reject: true },
  { service: 'Minor Electrical Assistance', candidateText: 'coiled rope coil', reject: true },
];

export const IMAGE_ACCEPT_CASES = [
  { service: 'Door Repair', candidateText: 'handyman adjusting residential door hinge repair', reject: false },
  { service: 'Fence Repair', candidateText: 'carpenter fixing timber fence panel outdoor', reject: false },
  { service: 'TV Wall Mounting', candidateText: 'technician mounting television wall bracket', reject: false },
  { service: 'Window Cleaning', candidateText: 'cleaner using squeegee on window glass', reject: false },
  { service: 'Gutter Cleaning', candidateText: 'worker cleaning roof gutter ladder', reject: false },
];

/**
 * Build typed handyman catalog for regression tests.
 */
export function buildCaHandymanTypedCatalog() {
  const profile = resolveCommerceProfile(CA_HANDYMAN_CTX);
  const blueprint = buildIndustryCatalog(
    { ...CA_HANDYMAN_CTX, verticalSlug: 'services.handyman' },
    25,
  );
  return compileCatalogForStore(
    { categories: blueprint.categories, products: blueprint.items, meta: blueprint.meta },
    CA_HANDYMAN_CTX,
    { businessCommerceProfile: profile, strict: false },
  );
}

/**
 * @param {string} serviceName
 * @param {string} candidateText
 */
export function evaluateCandidateRejection(serviceName, candidateText) {
  const intent = buildServiceImageIntent({ serviceName });
  const guard = evaluateServiceMismatchGuard(intent.canonicalTitle, candidateText);
  const meta = scoreServiceImageCandidateMetadata(intent, {
    provider: 'test',
    imageUrl: 'https://example.com/img.jpg',
    title: candidateText,
    altText: candidateText,
    tags: candidateText.split(' '),
    sourceQuery: intent.queries[0],
  });
  return {
    guardPass: guard.pass,
    hardReject: meta.hardReject,
    metadataScore: meta.metadataScore,
    rejected: !guard.pass || meta.hardReject,
  };
}

export function buildQaMismatchDraft() {
  const catalog = buildCaHandymanTypedCatalog();
  const items = catalog.catalogItems.map((item, i) => {
    const mismatch = IMAGE_MISMATCH_CASES[i % IMAGE_MISMATCH_CASES.length];
    return {
      ...item,
      imageUrl: `https://images.example.com/${i}.jpg`,
      imageSelection: {
        provider: 'test',
        sourceQuery: mismatch.service,
        canonicalItemName: item.name,
        matchedObjects: [],
        matchedActions: [],
        conflictingObjects: mismatch.candidateText.split(' '),
        metadataScore: 0.2,
        finalScore: 0.15,
        status: 'rejected',
      },
      imageMatchStatus: 'rejected',
    };
  });
  return {
    preview: {
      items,
      meta: {
        catalogKind: 'service',
        businessCommerceProfile: resolveCommerceProfile(CA_HANDYMAN_CTX),
        storeName: 'CA Handyman',
      },
    },
  };
}

export { runSemanticCatalogQa, assertCatalogKindConsistency };
