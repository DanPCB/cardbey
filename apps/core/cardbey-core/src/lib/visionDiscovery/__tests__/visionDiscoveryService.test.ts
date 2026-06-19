import { describe, expect, it, vi, beforeEach } from 'vitest';
import { assessVisionSensitivity } from '../visionSensitivityGuard.js';
import { extractVisionEntity } from '../entityExtractionService.js';

vi.mock('../VisionScanEventRepository.js', () => ({
  appendVisionScanEvent: vi.fn(async (e: unknown) => ({ ...(e as object), id: 'scan-1', createdAt: new Date().toISOString() })),
  findVisionScanByFingerprint: vi.fn(async () => null),
  getVisionScanEventById: vi.fn(),
  listVisionScanEvents: vi.fn(async () => []),
  patchVisionScanEvent: vi.fn(),
  normalizeScanType: (v: unknown) => (v === 'qr' ? 'qr' : 'unknown'),
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

describe('vision discovery extraction', () => {
  it('extracts LiverWell from client classification', () => {
    const extracted = extractVisionEntity({
      scanType: 'qr',
      rawPayload: 'https://www.liverwell.org.au/liverline-support',
      clientClassification: {
        type: 'service_organisation',
        title: 'LiverWell Australia',
        subtitle: 'Health support service',
        summary: 'LiverLine support page.',
        openUrl: 'https://www.liverwell.org.au/liverline-support',
        domain: 'liverwell.org.au',
        isHealthRelated: true,
      },
    });
    expect(extracted.entityName).toBe('LiverWell Australia');
    expect(extracted.entityType).toBe('service_organisation');
    expect(extracted.domain).toBe('liverwell.org.au');
  });

  it('blocks passport scans from pipeline', () => {
    const result = assessVisionSensitivity({
      entityType: 'unknown_link',
      scanType: 'uploaded_image',
      detectedText: 'PASSPORT Republic of Example',
    });
    expect(result.blocked).toBe(true);
    expect(result.pipelineEligible).toBe(false);
  });

  it('ignores personal contacts', () => {
    const result = assessVisionSensitivity({
      entityType: 'personal_contact',
      scanType: 'qr',
      rawPayload: 'mailto:friend@example.com',
    });
    expect(result.ignored).toBe(true);
    expect(result.pipelineEligible).toBe(false);
  });
});

describe('processVisionEntity', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns user-friendly result without auto store creation', async () => {
    const { processVisionEntity } = await import('../visionDiscoveryService.js');
    const result = await processVisionEntity({
      scanType: 'qr',
      rawPayload: 'https://www.liverwell.org.au/liverline',
      clientClassification: {
        type: 'service_organisation',
        title: 'LiverWell Australia',
        subtitle: 'Health support service',
        summary: 'Support service for liver health.',
        openUrl: 'https://www.liverwell.org.au/liverline',
      },
    });
    expect(result.ok).toBe(true);
    expect(result.userResult.title).toBe('LiverWell Australia');
    expect(result.userResult.isCardbeyStore).toBe(false);
    expect(result.userResult.canSuggestToCardbey).toBe(true);
    expect(result.userResult.notOnCardbeyNote).toBe('Not on Cardbey yet');
  });
});
