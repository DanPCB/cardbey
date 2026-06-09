import { describe, it, expect } from 'vitest';
import { buildBusinessProfileDraftPatch } from './businessProfileDraftSync.js';
import { isCommittedHeroAvatarOnlyPatch } from './draftStoreService.js';
import { buildLogoPreviewPatchFromUrl } from './logoUpdateService.js';

describe('buildBusinessProfileDraftPatch', () => {
  it('maps store PATCH fields to draft preview keys', () => {
    const patch = buildBusinessProfileDraftPatch({
      name: 'Melbourne Flooring',
      tagline: 'Transform your space',
      description: 'Long description',
      contactEmail: 'hello@example.com',
      phone: '0400 000 000',
      address: '1 Main St',
      suburb: 'Melbourne',
      postcode: '3000',
      country: 'AU',
    });
    expect(patch.storeName).toBe('Melbourne Flooring');
    expect(patch.tagline).toBe('Transform your space');
    expect(patch.slogan).toBe('Transform your space');
    expect(patch.description).toBe('Long description');
    expect(patch.email).toBe('hello@example.com');
    expect(patch.phone).toBe('0400 000 000');
    expect(patch.address).toBe('1 Main St');
  });
});

describe('isCommittedHeroAvatarOnlyPatch post-publish allowlist', () => {
  it('allows logo upload patch shape on committed drafts', () => {
    const patch = buildLogoPreviewPatchFromUrl('/uploads/logo.png', {});
    expect(isCommittedHeroAvatarOnlyPatch(patch)).toBe(true);
  });

  it('allows business profile text patch on committed drafts', () => {
    const patch = buildBusinessProfileDraftPatch({
      name: 'Cafe',
      tagline: 'Fresh coffee',
      description: 'All day breakfast',
    });
    expect(isCommittedHeroAvatarOnlyPatch(patch)).toBe(true);
  });

  it('still blocks catalog replacement on committed drafts', () => {
    expect(isCommittedHeroAvatarOnlyPatch({ items: [{ id: 'x', name: 'Latte' }] })).toBe(false);
  });
});
