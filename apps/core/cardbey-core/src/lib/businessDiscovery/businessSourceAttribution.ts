/**
 * TypeScript facade — canonical runtime is businessSourceAttribution.js
 */

import type { DiscoverySource, SourceAttribution } from './businessDiscoveryTypes.js';

export {
  sourceLabel,
  createAttribution,
  mergeAttributions,
  describeAttribution,
} from './businessSourceAttribution.js';

export type { DiscoverySource, SourceAttribution };
