/**
 * Publishing provider factory.
 * Default: mock (safe). Meta only when facebookProviderV1 + livePublishingV1.
 */

import { Features } from '../../../config/features.js';
import { createMockSocialPublishingProvider } from './MockSocialPublishingProvider.js';
import { createMetaFacebookPageProvider } from './MetaFacebookPageProvider.js';

/**
 * @param {{ preferMeta?: boolean, mockMode?: 'success'|'failure' }} [opts]
 * @returns {import('./SocialPublishingProvider.js').SocialPublishingProvider}
 */
export function getPublishingProvider(opts = {}) {
  const preferMeta =
    opts.preferMeta === true ||
    (Features.marketingOperator.facebookProviderV1 && Features.marketingOperator.livePublishingV1);

  if (preferMeta) {
    return createMetaFacebookPageProvider();
  }
  return createMockSocialPublishingProvider({ mode: opts.mockMode });
}

export { createMockSocialPublishingProvider, createMetaFacebookPageProvider };
export { PROVIDER_CODES } from './SocialPublishingProvider.js';
