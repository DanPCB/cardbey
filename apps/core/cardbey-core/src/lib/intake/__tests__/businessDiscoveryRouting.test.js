import { describe, expect, it } from 'vitest';
import {
  isStartBusinessDiscoveryIntent,
  isExplicitOpenBusinessDiscoveryIntent,
  hasValidBusinessCreationSources,
  isEmptyStoreCreationDraft,
  buildOpenBusinessDiscoveryResponse,
  isDeprecatedBusinessImportStudioNavigateTo,
  DEPRECATED_BUSINESS_IMPORT_STUDIO_PATH,
  buildPerformerDraftReviewHref,
} from '../businessDiscoveryRouting.js';

describe('businessDiscoveryRouting — Live runway isolation', () => {
  it.each([
    'Create a store for my business',
    'Help me build my business',
    'Create my shop',
    'Set up a business page',
    'Build a store for my company',
    'Create store',
    'Create Pho Ngon Braybrook',
    'Import my business',
    'Discover my business details',
  ])('does not divert %s to legacy Studio (Live Store Mission owns create/import)', (phrase) => {
    expect(isStartBusinessDiscoveryIntent(phrase)).toBe(false);
    expect(isExplicitOpenBusinessDiscoveryIntent(phrase)).toBe(false);
  });

  it.each([
    'Open Business Discovery',
    'Open Business Discovery Studio',
    'Open Business Import Studio',
    'Open the business import studio',
    'Business Import Studio',
    'Advanced review',
    'How Cardbey built this',
  ])('treats %s as legacy Studio phrase → Performer compat', (phrase) => {
    expect(isExplicitOpenBusinessDiscoveryIntent(phrase)).toBe(true);
    expect(isStartBusinessDiscoveryIntent(phrase)).toBe(true);
  });

  it('rejects empty storeCreationDraft as invalid sources', () => {
    const body = {
      storeCreationDraft: { name: '', category: '', location: '' },
    };
    expect(hasValidBusinessCreationSources(body)).toBe(false);
    expect(isEmptyStoreCreationDraft(body)).toBe(true);
  });

  it('accepts filled form or discovery text profile as sources', () => {
    expect(
      hasValidBusinessCreationSources({
        storeCreateForm: { storeName: 'Noodle House' },
      }),
    ).toBe(true);
    expect(
      hasValidBusinessCreationSources({
        discovery: {
          textProfile: { businessName: 'Noodle House' },
          images: [],
          links: [],
        },
      }),
    ).toBe(true);
  });

  it('buildOpenBusinessDiscoveryResponse maps to create_store without Studio navigateTo', () => {
    const res = buildOpenBusinessDiscoveryResponse({
      conversationSessionId: 'c1',
      entrySource: 'performer',
      userMessage: 'Open Business Import Studio',
    });
    expect(res.action).toBe('create_store');
    expect(res.autoSubmit).toBe(false);
    expect(res.stayInChat).toBe(true);
    expect(res.legacyAction).toBe('open_business_discovery_studio');
    expect(res.storeCreationDraft).toBeTruthy();
    expect(res.navigateTo).toBeUndefined();
    expect(String(res.response || '')).toMatch(/Performer/i);
    expect(isDeprecatedBusinessImportStudioNavigateTo(res.navigateTo)).toBe(false);
  });

  it('buildOpenBusinessDiscoveryResponse resumes existing draft without duplicate create', () => {
    const res = buildOpenBusinessDiscoveryResponse({
      performerMissionId: 'mp_1',
      draftId: 'ds_1',
      jobId: 'job_1',
    });
    expect(res.action).toBe('resume_active_mission');
    expect(res.draftId).toBe('ds_1');
    expect(res.missionId).toBe('mp_1');
    expect(res.reviewHref).toContain('/app/store/draft/review');
    expect(res.reviewHref).toContain('draftId=ds_1');
    expect(res.navigateTo).toBe(res.reviewHref);
    expect(String(res.navigateTo || '')).not.toContain(DEPRECATED_BUSINESS_IMPORT_STUDIO_PATH);
  });

  it('detects deprecated Studio navigateTo URLs', () => {
    expect(isDeprecatedBusinessImportStudioNavigateTo('/app/business-import-studio')).toBe(true);
    expect(
      isDeprecatedBusinessImportStudioNavigateTo('/app/business-import-studio?entrySource=performer'),
    ).toBe(true);
    expect(isDeprecatedBusinessImportStudioNavigateTo('/app/store/draft/review?draftId=x')).toBe(
      false,
    );
  });

  it('buildPerformerDraftReviewHref builds StoreDraftReview URL', () => {
    const href = buildPerformerDraftReviewHref({
      draftId: 'ds_9',
      missionId: 'mp_9',
    });
    expect(href).toBe('/app/store/draft/review?mode=draft&draftId=ds_9&missionId=mp_9');
  });
});
