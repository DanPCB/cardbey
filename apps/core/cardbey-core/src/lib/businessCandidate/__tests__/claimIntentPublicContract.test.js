import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { recordClaimButtonIntent } from '../brief/briefService.js';
import {
  getClaimIntentById,
  toPublicClaimIntentResponse,
} from '../claimIntent/claimIntentService.js';
import { resetClaimIntentsForTests } from '../claimIntent/claimIntentRepository.js';

describe('public claim-intent contract', () => {
  beforeEach(async () => {
    process.env.BUSINESS_CANDIDATE_DIR = path.join(
      process.cwd(),
      'data',
      'businessCandidates',
      'claim-intent-contract-test',
      String(Date.now()),
    );
    await resetClaimIntentsForTests();
  });

  it('POST helper returns claimIntentId that GET can load', async () => {
    const created = await recordClaimButtonIntent({
      seedId: 'seed-lune-1',
      businessSlug: 'lune-croissanterie-fitzroy-fitzroy-64cec9',
      source: 'CLAIM_BUTTON',
    });
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const payload = toPublicClaimIntentResponse(created, {
      businessSlug: 'lune-croissanterie-fitzroy-fitzroy-64cec9',
    });
    expect(payload.ok).toBe(true);
    expect(payload.claimIntentId).toBe(created.id);
    expect(payload.claimUrl).toBe(`/claim-business/${created.id}`);
    expect(payload.seedId).toBe('seed-lune-1');
    expect(payload.intent.businessSlug).toBe('lune-croissanterie-fitzroy-fitzroy-64cec9');

    const loaded = await getClaimIntentById(payload.claimIntentId);
    expect(loaded?.id).toBe(created.id);
    expect(loaded?.seedId).toBe('seed-lune-1');
  });
});
