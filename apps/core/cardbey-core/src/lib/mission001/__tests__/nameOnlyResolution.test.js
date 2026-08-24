/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isNameOnlyResearchInput,
  resolveNameOnlyInputForResearch,
} from '../nameOnlyResolution.js';

vi.mock('../../storeResearch/businessEntityResolver.js', () => ({
  resolveBusinessEntity: vi.fn(),
}));

import { resolveBusinessEntity } from '../../storeResearch/businessEntityResolver.js';

describe('Mission001 Gate 2 — name-only resolution', () => {
  const prevMaster = process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
  const prevName = process.env.ENABLE_MISSION_001_NAME_RESOLUTION_V1;

  beforeEach(() => {
    process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = '1';
    process.env.ENABLE_MISSION_001_NAME_RESOLUTION_V1 = '1';
    vi.mocked(resolveBusinessEntity).mockReset();
  });

  afterEach(() => {
    if (prevMaster === undefined) delete process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
    else process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = prevMaster;
    if (prevName === undefined) delete process.env.ENABLE_MISSION_001_NAME_RESOLUTION_V1;
    else process.env.ENABLE_MISSION_001_NAME_RESOLUTION_V1 = prevName;
  });

  it('detects name-only input', () => {
    expect(isNameOnlyResearchInput({ businessName: 'Anison Capital' }, {})).toBe(true);
    expect(
      isNameOnlyResearchInput({ businessName: 'Anison Capital', location: 'Melbourne' }, {}),
    ).toBe(false);
  });

  it('enters sparse mode when entity cannot be resolved confidently', async () => {
    vi.mocked(resolveBusinessEntity).mockResolvedValue({
      candidates: [
        { name: 'Anison Capital', confidence: 0.48, location: 'Sydney' },
        { name: 'Anison Capital', confidence: 0.46, location: 'Brisbane' },
      ],
      selectedCandidate: null,
      requiresOwnerConfirmation: true,
      confidence: 0.48,
    });

    const result = await resolveNameOnlyInputForResearch({ businessName: 'Anison Capital' }, {});
    expect(result.sparseMode).toBe(true);
    expect(result.enriched).toBe(false);
    expect(result.params.location).toBeUndefined();
  });

  it('enriches params when a strong singleton match is returned', async () => {
    vi.mocked(resolveBusinessEntity).mockResolvedValue({
      candidates: [
        {
          name: 'Anison Capital',
          confidence: 0.86,
          location: 'Melbourne VIC',
          website: 'https://anison.example',
          phone: '+61390000000',
          category: 'Financial Planner',
        },
      ],
      selectedCandidate: {
        name: 'Anison Capital',
        confidence: 0.86,
        location: 'Melbourne VIC',
        website: 'https://anison.example',
        phone: '+61390000000',
        category: 'Financial Planner',
      },
      requiresOwnerConfirmation: false,
      confidence: 0.86,
    });

    const result = await resolveNameOnlyInputForResearch({ businessName: 'Anison Capital' }, {});
    expect(result.enriched).toBe(true);
    expect(result.sparseMode).toBe(false);
    expect(result.params.location).toBe('Melbourne VIC');
    expect(result.input.website).toBe('https://anison.example');
  });
});
