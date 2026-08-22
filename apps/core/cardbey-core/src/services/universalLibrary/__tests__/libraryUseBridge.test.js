import { describe, it, expect } from 'vitest';
import {
  evaluateLibraryAssetReuse,
  universalAssetToUriResource,
  LIBRARY_USE_DESTINATION,
} from '../libraryUseBridge.js';

describe('libraryUseBridge', () => {
  it('maps destinations to URI draft adapters', () => {
    expect(LIBRARY_USE_DESTINATION.display).toBe('display_playlist_draft');
    expect(LIBRARY_USE_DESTINATION.promotion).toBe('promotion_draft');
    expect(LIBRARY_USE_DESTINATION.website).toBe('storefront_hero_draft');
    expect(LIBRARY_USE_DESTINATION.social).toBe('social_content_draft');
    expect(LIBRARY_USE_DESTINATION.performer).toBe('performer_conversation');
  });

  it('blocks rejected rights', () => {
    const gate = evaluateLibraryAssetReuse({
      status: 'PUBLISHED',
      rightsStatus: 'REJECTED',
      ownerId: 'pexels_platform',
    });
    expect(gate.ok).toBe(false);
    expect(gate.blocked).toBe(true);
    expect(gate.code).toBe('RIGHTS_BLOCKED');
  });

  it('maps Pexels UniversalAsset to provider-hosted URI resource without downloadUrl', () => {
    const resource = universalAssetToUriResource({
      id: 'asset1',
      title: 'Cafe photo',
      type: 'image',
      provider: 'pexels',
      status: 'PUBLISHED',
      rightsStatus: 'CLEARED',
      hostingMode: 'REFERENCE',
      license: 'Pexels License',
      preview: 'https://images.pexels.com/photos/1/medium.jpeg',
      thumbnail: 'https://images.pexels.com/photos/1/tiny.jpeg',
      sourceUrl: 'https://www.pexels.com/photo/1/',
      ownerId: 'pexels_platform',
      metadata: {
        remoteId: '1',
        creatorLabel: 'Ada',
        videoUrl: null,
      },
    });
    expect(resource.sourceId).toBe('src_pexels');
    expect(resource.custodyMode).toBe('PROVIDER_HOSTED');
    expect(resource.downloadUrl).toBeNull();
    expect(resource.binaryStored).toBe(false);
    expect(resource.provenance.universalLibrary).toBe(true);
    expect(resource.sourceMetadata.universalAssetId).toBe('asset1');
  });
});
