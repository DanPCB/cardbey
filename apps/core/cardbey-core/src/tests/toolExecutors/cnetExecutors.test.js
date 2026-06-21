// DANH: skill-round5-tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execute as checkCnetConfig } from '../../lib/toolExecutors/cnet/check_cnet_config.js';
import { execute as prepareCnetPayload } from '../../lib/toolExecutors/cnet/prepare_cnet_payload.js';
import { execute as deployToCnet } from '../../lib/toolExecutors/cnet/deploy_to_cnet.js';
import { EXECUTION_STATES } from '../../lib/telemetry/executionStates.js';

const publishPlaylist = vi.fn(async (payload) => ({ ok: true, id: payload.playlistId }));

vi.mock('../../adapters/cnet.js', () => ({
  makeCNetClient: () => ({
    publishPlaylist,
  }),
}));

describe('cnet executors', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    publishPlaylist.mockClear();
    delete process.env.CNET_API_KEY;
    delete process.env.CNET_ENDPOINT;
    delete process.env.CNET_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

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

  it('deploy_to_cnet blocks deployment without API key', async () => {
    const result = await deployToCnet({ storeId: 'test' });

    expect(result.status).toBe('blocked');
    expect(result.blocker?.code).toBe('CNET_NOT_CONFIGURED');
    expect(result.output?.executionState).toBe(EXECUTION_STATES.BLOCKED);
    expect(result.output?.deployed).toBe(false);
    expect(publishPlaylist).not.toHaveBeenCalled();
  });

  it('deploy_to_cnet side effect is honest non-deploy when keys missing', async () => {
    const result = await deployToCnet({ configured: false, payload: { storeId: 's1' } });
    expect(result.status).toBe('blocked');
    expect(result.output?.deployed).toBe(false);
    expect(result.output?.reason).toMatch(/CNET_API_KEY/i);
  });

  it('deploy_to_cnet deploys when configured', async () => {
    process.env.CNET_API_KEY = 'test-key';
    process.env.CNET_ENDPOINT = 'https://cnet.example.com';

    const result = await deployToCnet({
      storeId: 's1',
      payload: { storeId: 's1', products: [] },
      deviceIds: ['d1'],
    });

    expect(result.status).toBe('ok');
    expect(result.output?.deployed).toBe(true);
    expect(result.output?.executionState).toBe(EXECUTION_STATES.EXECUTED);
    expect(publishPlaylist).toHaveBeenCalledOnce();
  });

  it('deploy_to_cnet blocks when storeId missing despite configuration', async () => {
    process.env.CNET_API_KEY = 'test-key';
    process.env.CNET_ENDPOINT = 'https://cnet.example.com';

    const result = await deployToCnet({ configured: true });

    expect(result.status).toBe('blocked');
    expect(result.blocker?.code).toBe('STORE_ID_REQUIRED');
  });
});
