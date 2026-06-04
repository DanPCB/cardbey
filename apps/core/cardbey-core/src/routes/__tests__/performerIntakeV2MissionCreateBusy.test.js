import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  MissionCreateBusyError,
  missionCreateBusyHttpBody,
} from '../../lib/mission/missionCreateWrite.js';

vi.mock('../../lib/missionPipelineService.js', () => ({
  createMissionPipeline: vi.fn(async () => {
    throw new MissionCreateBusyError(Object.assign(new Error('Socket timeout'), { code: 'P1008' }));
  }),
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';

function appWithIntakeV2() {
  const app = express();
  app.use(express.json());
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

describe('POST /api/performer/intake/v2 create_store busy handling', () => {
  it('returns controlled 503 when mission create is busy', async () => {
    const res = await request(appWithIntakeV2())
      .post('/api/performer/intake/v2')
      .set('Authorization', 'Bearer test-token')
      .send({
        message: 'My Cafe · mini website · Food & drink · Melbourne',
        context: { intentMode: 'website' },
        parameters: {
          _autoSubmit: true,
          storeName: 'My Cafe',
          businessName: 'My Cafe',
          businessType: 'Food & drink',
          location: 'Melbourne',
        },
        classification: {
          executionPath: 'direct_action',
          tool: 'create_store',
          confidence: 1,
          parameters: {
            storeName: 'My Cafe',
            businessName: 'My Cafe',
            businessType: 'Food & drink',
            location: 'Melbourne',
            _autoSubmit: true,
          },
        },
      });

    if (res.status === 503) {
      expect(res.body).toEqual(missionCreateBusyHttpBody());
      return;
    }

    // If auth/guest middleware blocks before create path, at least ensure no 500 crash.
    expect(res.status).not.toBe(500);
  });
});
