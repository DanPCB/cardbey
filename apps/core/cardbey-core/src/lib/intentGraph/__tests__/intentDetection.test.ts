import { describe, expect, it } from 'vitest';
import { buildEntityContext } from '../entityContextBuilder.js';
import { detectVisionIntents } from '../intentDetectionService.js';
import { buildUserSessionContext } from '../../visionDiscovery/visionSessionContext.js';
import type { ExtractedVisionEntity } from '../../visionDiscovery/entityExtractionService.js';

const liverwellExtracted: ExtractedVisionEntity = {
  entityName: 'LiverWell Australia',
  entityType: 'service_organisation',
  category: 'Health support service',
  phone: null,
  email: null,
  website: 'https://www.liverwell.org.au/liverline',
  address: null,
  detectedUrl: 'https://www.liverwell.org.au/liverline',
  resolvedUrl: 'https://www.liverwell.org.au/liverline',
  domain: 'liverwell.org.au',
  confidence: 0.85,
  userFacingSummary: 'Health support organisation.',
  title: 'LiverWell Australia',
  subtitle: 'Health support service',
  isHealthRelated: true,
};

describe('vision intent graph', () => {
  it('suggests open, save, ask, and suggest for external service org', () => {
    const entity = buildEntityContext({
      extracted: liverwellExtracted,
      scanType: 'qr',
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
    const suggestions = detectVisionIntents(entity, buildUserSessionContext({ userId: 'guest-1' }));
    const ids = suggestions.map((s) => s.intentId);
    expect(ids).toContain('open_website');
    expect(ids).toContain('save_to_suitcase');
    expect(ids).toContain('ask_about_store');
    expect(ids).toContain('create_prestore_candidate');
  });

  it('limits sensitive scans to compliance intents', () => {
    const entity = buildEntityContext({
      extracted: { ...liverwellExtracted, entityType: 'personal_contact' },
      scanType: 'qr',
      scanEvent: null,
      match: {
        storeId: null,
        storeSlug: null,
        storeName: null,
        seedId: null,
        priorScan: null,
        matchKind: null,
      },
      privacyBlocked: true,
    });
    const suggestions = detectVisionIntents(entity, buildUserSessionContext({}));
    expect(suggestions.every((s) => ['explain_only', 'do_not_store', 'block_acquisition'].includes(s.intentId))).toBe(
      true,
    );
  });
});
