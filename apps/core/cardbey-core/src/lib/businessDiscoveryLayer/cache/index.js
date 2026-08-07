export {
  DISCOVERY_CACHE_NAMESPACES,
  DISCOVERY_CACHE_NAMESPACE_LIST,
  isDiscoveryCacheNamespace,
} from './discoveryCacheNamespaces.js';

export {
  setDiscoveryCache,
  getDiscoveryCache,
  invalidateDiscoveryCache,
  invalidateDiscoveryCachesForBusiness,
  clearDiscoveryCachesForTests,
  discoveryCacheStats,
} from './discoveryCache.js';
