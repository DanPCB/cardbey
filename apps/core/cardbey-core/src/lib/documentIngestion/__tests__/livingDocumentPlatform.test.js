import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichDisplayWithLivingDoc } from '../ingestionDisplayEnrichment.js';
import { buildVideoPromptFromExtraction } from '../livingDocumentMapper.js';
import { buildDocumentAwareSystemPrompt } from '../documentAwareConcierge.js';
import { resolveIngestionSkillCapability } from '../ingestionSkillCapabilities.js';
import { execute as generateLivingDocument } from '../../toolExecutors/document/generate_living_document.js';
import { execute as generateExecutionSummary } from '../../toolExecutors/document/generate_execution_summary.js';
import { execute as activateCampaigns } from '../../toolExecutors/campaign/activate_campaigns.js';
import { createMiJobFromIngestion } from '../../../services/mi/miJobFromIngestion.js';
import { execute as suggestCampaignPlan } from '../../toolExecutors/document/suggest_campaign_plan.js';

const AA_TRAVEL = {
  business: { name: 'AA Travel and Golf Tour' },
  campaign: { name: 'Asia Golf Experiences 2026' },
  contacts: [{ name: 'Mark', phone: '+61 400 000 000', email: 'mark@example.com' }],
  products: [
    {
      name: 'Vietnam Golf Package',
      location: 'Vietnam',
      venues: ['Tan Son Nhat', 'The Bluffs'],
      highlights: ['3 championship rounds in Vietnam'],
      pricing: [{ tier: '4-star', price: 1388, currency: 'AUD' }],
      includes: ['3 rounds', '5 nights', 'gala dinner'],
      dates: 'July/Aug 2026',
      deadline: '2026-07-01',
    },
  ],
};

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => mockPrisma,
}));

vi.mock('../../smartDocument/buildSmartDocument.js', () => ({
  buildSmartDocument: vi.fn(async () => ({ documentId: 'sd-1', liveUrl: 'https://cardbey.test/s/aa-travel' })),
}));

vi.mock('../../../services/draftStore/publishDraftService.js', () => ({
  publishDraft: vi.fn(async () => ({
    slug: 'aa-travel-and-golf-tour',
    draftId: 'draft-1',
    storeId: 'store-aa',
  })),
}));

vi.mock('../../missionBlackboard.js', () => ({
  appendEvent: vi.fn(async () => {}),
}));

vi.mock('../../documentIngestion/persistIngestionContext.js', () => ({
  persistIngestionContext: vi.fn(async () => {}),
}));

vi.mock('../../skills/index.js', () => ({
  skillRouter: { route: vi.fn(async () => ({ matched: true })) },
}));

/** @type {object} */
let mockPrisma;

beforeEach(() => {
  mockPrisma = {
    playlist: {
      findMany: vi.fn(async () => [{ id: 'pl-1', name: 'Lobby Screen' }]),
    },
    campaignPlan: {
      create: vi.fn(async () => ({ id: 'plan-1' })),
    },
    business: {
      findUnique: vi.fn(async () => ({
        id: 'store-aa',
        slug: 'aa-travel-and-golf-tour',
        publishedAt: new Date(),
        userId: 'user-1',
        storefrontSettings: {},
      })),
      update: vi.fn(async ({ data }) => ({ id: 'store-aa', storefrontSettings: data.storefrontSettings })),
    },
    publishedArtifactProjection: {
      findUnique: vi.fn(async () => ({ heroVideoUrl: null })),
    },
    storePromo: {
      findMany: vi.fn(async () => [
        { id: 'promo-1', title: 'Summer' },
        { id: 'promo-2', title: 'Golf' },
        { id: 'promo-3', title: 'Escape' },
      ]),
      update: vi.fn(async ({ where }) => ({ id: where.id, isActive: true })),
    },
    missionContext: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  };
});

describe('living document platform', () => {
  it('generate_living_document skips gracefully when storeId missing', async () => {
    const result = await generateLivingDocument({ extractedData: AA_TRAVEL }, {});
    expect(result.output.skipped).toBe(true);
    expect(result.output.livingDocumentCreated).toBe(false);
  });

  it('generate_living_document creates draft and publishes storefront', async () => {
    const result = await generateLivingDocument(
      { storeId: 'store-aa', extractResult: { data: AA_TRAVEL } },
      { storeId: 'store-aa', userId: 'user-1', missionId: 'mission-1' },
    );
    expect(result.output.livingDocumentCreated).toBe(true);
    expect(result.output.slug).toBe('aa-travel-and-golf-tour');
    expect(result.output.publishedUrl).toContain('/s/aa-travel-and-golf-tour');
  });

  it('generate_execution_summary.display.storefront populated when livingDocResult passed', async () => {
    const summary = await generateExecutionSummary({
      storeId: 'store-aa',
      extractResult: { data: AA_TRAVEL, extracted: true },
      productsResult: { created: ['p1'], count: 1 },
      promosResult: { created: ['pr1'], count: 1 },
      planResult: { calendar: [{ week: 'Week 1', action: 'Launch' }] },
      livingDocResult: {
        slug: 'aa-travel-and-golf-tour',
        publishedUrl: 'https://cardbey.test/s/aa-travel-and-golf-tour',
        livingDocumentCreated: true,
      },
    });
    expect(summary.output.display.storefront?.url).toContain('aa-travel-and-golf-tour');
    expect(summary.output.display.nextActions?.[0]?.label).toBe('View living document');
  });

  it('enrichDisplayWithLivingDoc updates primary next action', () => {
    const display = enrichDisplayWithLivingDoc(
      {
        type: 'document_ingestion_result',
        nextActions: [{ label: 'Publish to storefront', intent: 'publish_store', storeId: 'store-aa' }],
      },
      { slug: 'aa-travel', publishedUrl: 'https://cardbey.test/s/aa-travel', livingDocumentCreated: true },
    );
    expect(display.storefront?.published).toBe(true);
    expect(display.nextActions[0].label).toBe('View living document');
  });

  it('buildVideoPromptFromExtraction produces AA Travel prompt', () => {
    const prompt = buildVideoPromptFromExtraction(AA_TRAVEL);
    expect(prompt).toContain('Asia Golf Experiences 2026');
    expect(prompt).toContain('Tan Son Nhat');
    expect(prompt).toContain('3 championship rounds');
  });

  it('createMiJobFromIngestion creates scenes and dedupes recent job', async () => {
    const first = await createMiJobFromIngestion(mockPrisma, {
      storeId: 'store-aa',
      extractedData: AA_TRAVEL,
      missionId: 'm1',
    });
    expect(first.scenes).toHaveLength(3);
    expect(first.scenes[0].type).toBe('promotion');

    mockPrisma.business.findUnique = vi.fn(async () => ({
      storefrontSettings: {
        documentIngestion: {
          miJobId: first.id,
          updatedAt: new Date().toISOString(),
          miScenes: first.scenes,
        },
      },
    }));

    const second = await createMiJobFromIngestion(mockPrisma, {
      storeId: 'store-aa',
      extractedData: AA_TRAVEL,
    });
    expect(second.existing).toBe(true);
    expect(second.id).toBe(first.id);
  });

  it('buildDocumentAwareSystemPrompt includes product prices and contacts', () => {
    const prompt = buildDocumentAwareSystemPrompt({
      business: { name: 'AA Travel' },
      products: AA_TRAVEL.products,
      contacts: AA_TRAVEL.contacts,
    });
    expect(prompt).toContain('$1388 AUD');
    expect(prompt).toContain('3 rounds');
    expect(prompt).toContain('+61 400 000 000');
  });

  it('document_ingestion_booking capability resolves to BookingManagementSkill', () => {
    const resolved = resolveIngestionSkillCapability('book_product', {
      products: AA_TRAVEL.products,
      contacts: AA_TRAVEL.contacts,
    });
    expect(resolved?.skill).toBe('booking_management');
    expect(resolved?.capabilityId).toBe('document_ingestion_booking');
    expect(resolved?.input.availableDates).toContain('July/Aug 2026');
  });

  it('activate_campaigns sets StorePromo active', async () => {
    const result = await activateCampaigns({ storeId: 'store-aa' }, { storeId: 'store-aa' });
    expect(result.output.activated).toBe(3);
    expect(result.output.promos).toHaveLength(3);
    expect(mockPrisma.storePromo.update).toHaveBeenCalledTimes(3);
  });

  it('suggest_campaign_plan queues display publish when signage playlists exist', async () => {
    const result = await suggestCampaignPlan({
      storeId: 'store-aa',
      missionId: 'mission-1',
      extracted: true,
      data: AA_TRAVEL,
    });
    expect(result.output.displayQueuePlanned).toBe(true);
    expect(result.output.screensQueued).toBe(1);
  });
});
