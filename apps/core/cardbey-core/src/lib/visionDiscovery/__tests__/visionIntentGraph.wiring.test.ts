import { describe, expect, it, vi, beforeEach } from 'vitest';
import { extractVisionEntity } from '../entityExtractionService.js';
import { enrichVisionInputFromImage } from '../imageVisionExtractionService.js';
import { buildEntityContext } from '../../intentGraph/entityContextBuilder.js';
import { detectVisionIntents } from '../../intentGraph/intentDetectionService.js';
import { buildUserSessionContext } from '../../visionDiscovery/visionSessionContext.js';
import { assessVisionSensitivity } from '../visionSensitivityGuard.js';
import { planVisionAction } from '../../intentGraph/actionPlanner.js';

vi.mock('../../vision/cardScanPipeline.js', () => ({
  runCardScanPipeline: vi.fn(async () => ({
    ok: false,
    error: { code: 'LOW_CONFIDENCE', message: 'unreadable' },
  })),
}));

vi.mock('../VisionScanEventRepository.js', () => ({
  appendVisionScanEvent: vi.fn(async (e: Record<string, unknown>) => ({
    ...e,
    id: 'scan-test-1',
    createdAt: new Date().toISOString(),
  })),
  findVisionScanByFingerprint: vi.fn(async () => null),
  getVisionScanEventById: vi.fn(),
  listVisionScanEvents: vi.fn(async () => []),
  patchVisionScanEvent: vi.fn(),
  normalizeScanType: (v: unknown) => v ?? 'unknown',
}));

vi.mock('../visionCardbeyMatcher.js', () => ({
  matchVisionToCardbey: vi.fn(async () => ({
    storeId: null,
    storeSlug: null,
    storeName: null,
    seedId: null,
    priorScan: null,
    matchKind: null,
  })),
}));

vi.mock('../visionScanFlags.js', () => ({
  isVisionScanStorageEnabled: () => true,
  isVisionToDiscoveryEnabled: () => true,
  isVisionAutoSeedEnabled: () => false,
}));

vi.mock('../../intentGraph/entityContextBuilder.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../intentGraph/entityContextBuilder.js')>();
  return actual;
});

vi.mock('../EntityContextRepository.js', () => ({
  saveEntityContext: vi.fn(async (c: unknown) => c),
}));

vi.mock('../VisionIntentEventRepository.js', () => ({
  recordIntentSuggestionsShown: vi.fn(async () => undefined),
  appendVisionIntentEvent: vi.fn(),
  patchVisionIntentEvent: vi.fn(),
}));

describe('vision intent graph wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('QR path returns entity context and intents', async () => {
    const { processVisionEntity } = await import('../visionDiscoveryService.js');
    const result = await processVisionEntity({
      scanType: 'qr',
      rawPayload: 'https://www.liverwell.org.au/liverline',
      clientClassification: {
        type: 'service_organisation',
        title: 'LiverWell Australia',
        subtitle: 'Health support service',
        summary: 'Support page.',
        openUrl: 'https://www.liverwell.org.au/liverline',
      },
    });
    expect(result.entityContext.id).toBeTruthy();
    expect(result.intentSuggestions.length).toBeGreaterThan(0);
    expect(result.intentSuggestions.some((s) => s.intentId === 'open_website')).toBe(true);
  });

  it('uploaded image returns EntityContext without fabricated business name', async () => {
    const enriched = await enrichVisionInputFromImage({
      scanType: 'uploaded_image',
      imageBuffer: Buffer.from('fake'),
      mimeType: 'image/jpeg',
    });
    const extracted = extractVisionEntity(enriched);
    expect(extracted.title).toBe('Image received');
    expect(extracted.confidence).toBeLessThanOrEqual(0.55);
    expect(extracted.userFacingSummary).toMatch(/could not identify/i);
  });

  it('storefront scan suggests DiscoveryAgent intent', () => {
    const extracted = extractVisionEntity({
      scanType: 'storefront_photo',
      clientClassification: {
        type: 'external_business',
        title: 'Corner Cafe',
        subtitle: 'Storefront',
        summary: 'Storefront on Main St.',
      },
    });
    const entity = buildEntityContext({
      extracted,
      scanType: 'storefront_photo',
      scanEvent: null,
      match: {
        storeId: null,
        storeSlug: null,
        storeName: null,
        seedId: null,
        priorScan: null,
        matchKind: null,
      },
    });
    const intents = detectVisionIntents(entity, buildUserSessionContext({}));
    expect(intents.some((s) => s.suggestedAgent === 'DiscoveryAgent')).toBe(true);
    expect(intents.some((s) => s.intentId === 'create_prestore_candidate')).toBe(true);
  });

  it('menu scan suggests CatalogAgent intent', () => {
    const extracted = extractVisionEntity({
      scanType: 'menu_photo',
      clientClassification: {
        type: 'product',
        title: 'Menu photo',
        subtitle: 'Menu',
        summary: 'Menu photo received.',
      },
    });
    const entity = buildEntityContext({
      extracted,
      scanType: 'menu_photo',
      scanEvent: null,
      imageAssetUrl: '/uploads/media/menu.jpg',
      match: {
        storeId: null,
        storeSlug: null,
        storeName: null,
        seedId: null,
        priorScan: null,
        matchKind: null,
      },
    });
    const intents = detectVisionIntents(entity, buildUserSessionContext({ userId: 'user-1' }));
    expect(intents.some((s) => s.suggestedAgent === 'CatalogAgent')).toBe(true);
    expect(intents.some((s) => s.intentId === 'extract_menu_items')).toBe(true);
  });

  it('sensitive image blocks acquisition', () => {
    const result = assessVisionSensitivity({
      entityType: 'unknown_link',
      scanType: 'uploaded_image',
      detectedText: 'PASSPORT United Kingdom',
    });
    expect(result.blocked).toBe(true);
    expect(result.pipelineEligible).toBe(false);
  });

  it('unknown image does not invent business details', () => {
    const extracted = extractVisionEntity({
      scanType: 'camera_photo',
      imageMetadata: { lowConfidence: true },
    });
    expect(extracted.title).toBe('Photo received');
    expect(extracted.entityName).toBe('Photo received');
    expect(extracted.userFacingSummary).toMatch(/could not identify/i);
  });

  it('execute-intent requires confirmation for medium-risk actions', () => {
    const entity = buildEntityContext({
      extracted: extractVisionEntity({
        scanType: 'storefront_photo',
        clientClassification: {
          type: 'external_business',
          title: 'Shop',
          subtitle: 'Storefront',
          summary: 'A shop front.',
        },
      }),
      scanType: 'storefront_photo',
      scanEvent: null,
      match: {
        storeId: null,
        storeSlug: null,
        storeName: null,
        seedId: null,
        priorScan: null,
        matchKind: null,
      },
    });
    const plan = planVisionAction({
      intentId: 'create_prestore_candidate',
      entity,
      session: buildUserSessionContext({ userId: 'u1' }),
      confirmed: false,
    });
    expect('error' in plan && plan.error).toBe('confirmation_required');
  });
});
