import { describe, expect, it } from 'vitest';
import { stripMissionTitleBusinessPrefix } from '../../../services/draftStore/sanitizeDraftBusinessName.js';

function resolveStructuredStoreIdentity(meta, mission, input = {}) {
  const deferred = meta?.deferredStorePipeline?.body;
  const deferredBody =
    deferred && typeof deferred === 'object' && !Array.isArray(deferred) ? deferred : {};
  const pick = (...vals) => {
    for (const v of vals) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  const businessName = stripMissionTitleBusinessPrefix(
    pick(
      meta.businessName,
      meta.storeName,
      deferredBody.businessName,
      deferredBody.storeName,
      input.businessName,
      input.storeName,
      mission?.title,
    ),
  );
  const location = pick(meta.location, deferredBody.location, input.location);
  return { businessName, location };
}

describe('structured store identity resolve', () => {
  it('strips Create store title prefix', () => {
    expect(stripMissionTitleBusinessPrefix('Create store: Pho Saigon')).toBe('Pho Saigon');
    expect(stripMissionTitleBusinessPrefix('Create a store for Pho Saigon')).toBe('Pho Saigon');
  });

  it('recovers name/location from deferred body when top-level meta wiped', () => {
    const id = resolveStructuredStoreIdentity(
      {
        websiteUrl: 'https://phosaigon.com.au',
        deferredStorePipeline: {
          body: {
            businessName: 'Pho Saigon',
            location: 'Melbourne',
            websiteUrl: 'https://phosaigon.com.au',
          },
        },
      },
      { title: 'Create store: Pho Saigon' },
      {},
    );
    expect(id.businessName).toBe('Pho Saigon');
    expect(id.location).toBe('Melbourne');
  });
});
