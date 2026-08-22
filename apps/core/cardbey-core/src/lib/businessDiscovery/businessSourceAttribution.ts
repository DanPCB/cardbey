/**
 * TypeScript facade — canonical runtime is businessSourceAttribution.runtime.js
 */

import type { DiscoverySource, SourceAttribution } from './businessDiscoveryTypes.js';

export {
  sourceLabel,
  createAttribution,
  mergeAttributions,
  describeAttribution,
} from './businessSourceAttribution.runtime.js';

export type { DiscoverySource, SourceAttribution };
