import { describe, expect, it } from 'vitest';
import { buildDashboardClaimUrl } from '../src/pairing/claimUrl.js';

describe('buildDashboardClaimUrl', () => {
  it('uses real Devices deep-link params pairCode + pairSessionId', () => {
    const url = buildDashboardClaimUrl({
      dashboardBaseUrl: 'https://cardbey-dashboard-staging.onrender.com/',
      code: 'Ab12Cd',
      sessionId: 'sess-1',
    });
    expect(url).toBe(
      'https://cardbey-dashboard-staging.onrender.com/devices?pairCode=Ab12Cd&pairSessionId=sess-1',
    );
  });
});
