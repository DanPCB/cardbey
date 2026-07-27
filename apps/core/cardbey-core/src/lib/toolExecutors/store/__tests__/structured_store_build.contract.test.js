import { describe, it, expect } from 'vitest';
import * as structuredStoreBuild from '../structured_store_build.js';

describe('structured_store_build contract', () => {
  it('fails fast when missionId is missing', async () => {
    const result = await structuredStoreBuild.execute({}, {});
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('MISSING_MISSION');
  });

  it('fails fast when mission pipeline row is missing', async () => {
    const result = await structuredStoreBuild.execute(
      {},
      { missionId: 'nonexistent-mission-id-xyz' },
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('MISSION_NOT_FOUND');
  });
});
