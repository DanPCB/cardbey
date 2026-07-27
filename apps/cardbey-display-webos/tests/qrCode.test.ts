import { describe, expect, it } from 'vitest';
import { renderClaimQr } from '../src/pairing/qrCode.js';
import { buildDashboardClaimUrl } from '../src/pairing/claimUrl.js';

describe('renderClaimQr', () => {
  it('renders local data URL for claim URL', async () => {
    const value = buildDashboardClaimUrl({
      dashboardBaseUrl: 'https://cardbey-dashboard-staging.onrender.com',
      code: 'Ab12Cd',
      sessionId: 'sess-1',
    });
    const result = await renderClaimQr(value);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(value);
      expect(result.dataUrl.startsWith('data:image/png')).toBe(true);
    }
  });

  it('falls back on empty value', async () => {
    const result = await renderClaimQr('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('empty_qr_value');
  });
});
