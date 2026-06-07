// DANH: skill-round5-tests
import { describe, it, expect } from 'vitest';
import { execute as checkCnetConfig } from '../../lib/toolExecutors/cnet/check_cnet_config.js';
import { execute as prepareCnetPayload } from '../../lib/toolExecutors/cnet/prepare_cnet_payload.js';
import { execute as deployToCnet } from '../../lib/toolExecutors/cnet/deploy_to_cnet.js';

describe('cnet executors', () => {
  it('check_cnet_config returns ok output', async () => {
    const result = await checkCnetConfig({ storeId: 's1' });
    expect(result.status).toBe('ok');
    expect(typeof result.output.configured).toBe('boolean');
  });

  it('prepare_cnet_payload returns honest stub when not configured', async () => {
    const result = await prepareCnetPayload({ storeId: 's1', configured: false });
    expect(result.status).toBe('ok');
    expect(result.output?.prepared).toBe(false);
  });

  it('deploy_to_cnet does not throw on empty input', async () => {
    const result = await deployToCnet({});
    expect(result.status).toBe('ok');
    expect(result.output?.deployed).toBe(false);
  });

  it('deploy_to_cnet side effect is honest non-deploy when keys missing', async () => {
    const result = await deployToCnet({ configured: false, payload: { storeId: 's1' } });
    expect(result.output?.deployed).toBe(false);
    expect(result.output?.reason).toMatch(/CNET_API_KEY/i);
  });
});
