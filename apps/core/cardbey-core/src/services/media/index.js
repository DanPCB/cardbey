export {
  resolveServiceImageForItem,
  isServiceImageResolverEnabled,
  shouldUseServiceImageResolver,
  dedupeServiceCatalogItems,
  ServiceImageRegistry,
  buildServiceImageIntent,
  canonicalizeServiceTitle,
  normalizeServiceKey,
} from './serviceImageResolver.js';

export { scoreServiceImageCandidateMetadata, STRONG_MATCH, ACCEPTABLE_MATCH } from './serviceImageCandidateScorer.js';
export { evaluateServiceMismatchGuard } from './serviceImageMismatchGuards.js';
