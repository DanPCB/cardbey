import { describe, it, expect } from 'vitest';
import { compactMissionEvents } from '../missionEventSanitizer.js';

describe('missionEventSanitizer', () => {
  it('strips base64 image payload from events', () => {
    const events = compactMissionEvents([
      {
        id: '1',
        missionId: 'm1',
        type: 'context_update',
        payload: {
          imageDataUrl: `data:image/png;base64,${'x'.repeat(300)}`,
          note: 'ok',
        },
        createdAt: new Date().toISOString(),
      },
    ]);
    expect(events[0].payload).toEqual({ note: 'ok' });
  });
});
