/**
 * buildStoreInputV1.test.js
 * Golden tests — Phase 0 gate.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  normalizeBuildStoreInput,
  serializeToBuildStoreJobInput,
  INTENT_MODES,
  SOURCE_TYPES,
} from '../buildStoreInputV1.js';

function expectedGoldenShape(overrides = {}) {
  return {
    businessName:     'Construct Corp',
    businessType:     'construction',
    storeType:        'construction',
    location:         'Melbourne',
    intentMode:       INTENT_MODES.STORE,
    currencyCode:     'AUD',
    rawUserText:      'Build a store for Construct Corp, a construction business in Melbourne',
    includeImages:    true,
    storeId:          'temp',
    tenantId:         'tenant-123',
    userId:           'user-456',
    generationRunId:  '',
    missionId:        '',
    websiteUrl:       '',
    sourceType:       SOURCE_TYPES.FORM,
    ...overrides,
  };
}

describe('BuildStoreInputV1 — Intake V2 create_store runway', () => {
  it('produces canonical BuildStoreInputV1 from Intake V2 _autoSubmit payload', () => {
    const intakeV2Payload = {
      storeName:        'Construct Corp',
      storeType:        'construction',
      location:         'Melbourne',
      intentMode:       'store',
      currencyCode:     'AUD',
      userMessage:      'Build a store for Construct Corp, a construction business in Melbourne',
      tenantId:         'tenant-123',
      userId:           'user-456',
    };

    const result = normalizeBuildStoreInput(intakeV2Payload, {
      sourceType: SOURCE_TYPES.FORM,
    });

    expect(result).toEqual(expectedGoldenShape({
      sourceType: SOURCE_TYPES.FORM,
    }));
  });

  it('serializes correctly to createBuildStoreJob input shape', () => {
    const input = normalizeBuildStoreInput({
      storeName:    'Construct Corp',
      storeType:    'construction',
      location:     'Melbourne',
      intentMode:   'store',
      currencyCode: 'AUD',
      userMessage:  'Build a store for Construct Corp, a construction business in Melbourne',
      tenantId:     'tenant-123',
      userId:       'user-456',
    }, { sourceType: SOURCE_TYPES.FORM });

    const serialized = serializeToBuildStoreJobInput(input);

    expect(serialized.businessName).toBe('Construct Corp');
    expect(serialized.businessType).toBe('construction');
    expect(serialized.location).toBe('Melbourne');
    expect(serialized.intentMode).toBe('store');
    expect(serialized.currencyCode).toBe('AUD');
    expect(serialized.rawInput).toBe(
      'Build a store for Construct Corp, a construction business in Melbourne'
    );
    expect(serialized.storeId).toBe('temp');
  });
});

describe('BuildStoreInputV1 — MI Orchestra /start runway', () => {
  it('produces canonical BuildStoreInputV1 from orchestra request payload', () => {
    const orchestraPayload = {
      businessName:         'Construct Corp',
      requestBusinessType:  'construction',
      location:             'Melbourne',
      intentMode:           'store',
      currencyCode:         'AUD',
      rawInput:             'Build a store for Construct Corp, a construction business in Melbourne',
      tenantId:             'tenant-123',
      userId:               'user-456',
    };

    const result = normalizeBuildStoreInput(orchestraPayload, {
      sourceType: SOURCE_TYPES.FORM,
    });

    expect(result).toEqual(expectedGoldenShape({
      sourceType: SOURCE_TYPES.FORM,
    }));
  });
});

describe('BuildStoreInputV1 — Operator tool runway', () => {
  it('produces canonical BuildStoreInputV1 from operator tool params (aligned with start_build_store)', () => {
    const operatorPayload = {
      businessName:  'Construct Corp',
      businessType:  'construction',
      location:        'Melbourne',
      intentMode:      'store',
      currencyCode:    'AUD',
      rawInput:        'Build a store for Construct Corp, a construction business in Melbourne',
      tenantId:        'tenant-123',
      userId:          'user-456',
    };

    const result = normalizeBuildStoreInput(operatorPayload, {
      sourceType: SOURCE_TYPES.OPERATOR,
    });

    expect(result).toEqual(expectedGoldenShape({
      sourceType: SOURCE_TYPES.OPERATOR,
    }));
  });

  it('preserves personal_presence intentMode for operator params', () => {
    const result = normalizeBuildStoreInput(
      {
        businessName: 'Construct Corp',
        businessType: 'construction',
        location: 'Melbourne',
        intentMode: 'personal_presence',
        currencyCode: 'AUD',
        rawInput: 'Build a store for Construct Corp',
        tenantId: 'tenant-123',
        userId: 'user-456',
      },
      { sourceType: SOURCE_TYPES.OPERATOR },
    );

    expect(result.intentMode).toBe(INTENT_MODES.PERSONAL_PRESENCE);
    expect(result.currencyCode).toBe('AUD');
    expect(result.location).toBe('Melbourne');
  });
});

describe('BuildStoreInputV1 — alias normalization', () => {
  it('maps storeName → businessName', () => {
    const result = normalizeBuildStoreInput({ storeName: 'My Shop' });
    expect(result.businessName).toBe('My Shop');
  });

  it('prefers businessName over storeName when both present', () => {
    const result = normalizeBuildStoreInput({ businessName: 'Canonical', storeName: 'Alias' });
    expect(result.businessName).toBe('Canonical');
  });

  it('maps rawInput → rawUserText', () => {
    const result = normalizeBuildStoreInput({ rawInput: 'user text' });
    expect(result.rawUserText).toBe('user text');
  });

  it('maps prompt → rawUserText', () => {
    const result = normalizeBuildStoreInput({ prompt: 'user text' });
    expect(result.rawUserText).toBe('user text');
  });

  it('prefers rawUserText over rawInput over prompt', () => {
    const result = normalizeBuildStoreInput({
      rawUserText: 'canonical',
      rawInput:    'alias1',
      prompt:      'alias2',
    });
    expect(result.rawUserText).toBe('canonical');
  });

  it('maps requestBusinessType → businessType when businessType missing', () => {
    const result = normalizeBuildStoreInput({ requestBusinessType: 'retail' });
    expect(result.businessType).toBe('retail');
  });

  it('uppercases currencyCode', () => {
    const result = normalizeBuildStoreInput({ currencyCode: 'aud' });
    expect(result.currencyCode).toBe('AUD');
  });

  it('defaults intentMode to store when missing', () => {
    const result = normalizeBuildStoreInput({ businessName: 'Test' });
    expect(result.intentMode).toBe('store');
  });

  it('defaults storeId to temp when missing', () => {
    const result = normalizeBuildStoreInput({ businessName: 'Test' });
    expect(result.storeId).toBe('temp');
  });

  it('defaults includeImages to true', () => {
    const result = normalizeBuildStoreInput({ businessName: 'Test' });
    expect(result.includeImages).toBe(true);
  });

  it('respects includeImages: false', () => {
    const result = normalizeBuildStoreInput({ businessName: 'Test', includeImages: false });
    expect(result.includeImages).toBe(false);
  });
});

describe('BuildStoreInputV1 — validation', () => {
  it('warns when both businessName and rawUserText are empty', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeBuildStoreInput({ location: 'Melbourne' });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('both businessName and rawUserText are empty'),
      expect.any(Object),
    );
    warnSpy.mockRestore();
  });

  it('does not warn when businessName is present', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeBuildStoreInput({ businessName: 'Test' });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not warn when rawUserText is present', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeBuildStoreInput({ rawInput: 'create a shop' });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
