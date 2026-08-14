import { describe, expect, it } from 'vitest';
import {
  RESULT_CODES,
  HEALTH,
  operatorActionForCode,
  NON_RETRYABLE_CODES,
} from '../discoveryResultCodes.js';
import {
  classifyGoogleMapsResolve,
  classifyTikTokHashtagEmpty,
  classifyBatchOutcome,
  sanitizeDiagnosticEvent,
} from '../classifyDiscoveryFailure.js';
import { deriveSourceHealth, shouldSkipCronForHealth } from '../sourceHealth.js';

describe('Discovery diagnostics V2', () => {
  it('classifies google_maps free-text as CONFIG_ERROR (not Places API / not NO_RESULTS)', () => {
    const r = classifyGoogleMapsResolve('Nails and beauty services');
    expect(r.code).toBe(RESULT_CODES.CONFIG_ERROR);
    expect(r.retryable).toBe(false);
    expect(r.message.toLowerCase()).toMatch(/place url|places api/);
    expect(classifyGoogleMapsResolve('https://maps.google.com/place/x')).toBeNull();
  });

  it('classifies TikTok empty shell as PROVIDER_BLOCKED', () => {
    const r = classifyTikTokHashtagEmpty({ html: '', status: 200 });
    expect(r.code).toBe(RESULT_CODES.PROVIDER_BLOCKED);
    expect(operatorActionForCode(r.code)).toMatch(/Direct URL/i);
  });

  it('treats NO_RESULTS and SKIPPED distinctly from technical failures', () => {
    const noResults = classifyBatchOutcome(
      { discovered: 0, created: 0, skipped: 0, failed: 0, preBuilt: 0 },
      [{ code: RESULT_CODES.NO_RESULTS, message: 'empty' }],
    );
    expect(noResults.code).toBe(RESULT_CODES.NO_RESULTS);

    const skipped = classifyBatchOutcome(
      { discovered: 1, created: 0, skipped: 1, failed: 0, preBuilt: 0 },
      [{ code: RESULT_CODES.SKIPPED, skipReason: 'ALREADY_EXISTS' }],
    );
    expect(skipped.code).toBe(RESULT_CODES.SKIPPED);
    expect(skipped.skipReason).toBe('ALREADY_EXISTS');
  });

  it('derives HEALTHY / BLOCKED / MISCONFIGURED from recent history', () => {
    const healthy = deriveSourceHealth([
      {
        status: 'completed',
        created: 1,
        failed: 0,
        skipped: 0,
        configSnapshot: { result: { code: RESULT_CODES.SUCCESS, message: 'ok', retryable: false } },
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ]);
    expect(healthy.health).toBe(HEALTH.HEALTHY);

    const blocked = deriveSourceHealth([
      {
        status: 'completed',
        created: 0,
        failed: 0,
        discovered: 0,
        errorLog: [{ code: RESULT_CODES.PROVIDER_BLOCKED, message: 'blocked' }],
        startedAt: new Date().toISOString(),
      },
    ]);
    expect(blocked.health).toBe(HEALTH.BLOCKED);
    expect(shouldSkipCronForHealth(blocked, 'cron')).toBe(true);
    expect(shouldSkipCronForHealth(blocked, 'manual')).toBe(false);

    const misconfigured = deriveSourceHealth([
      {
        status: 'failed',
        created: 0,
        failed: 1,
        errorLog: [{ error: 'CONFIG_ERROR', detail: 'google_maps_query_unsupported_use_place_url' }],
        startedAt: new Date().toISOString(),
      },
    ]);
    expect(misconfigured.health).toBe(HEALTH.MISCONFIGURED);
    expect(NON_RETRYABLE_CODES.has(misconfigured.lastResultCode)).toBe(true);
  });

  it('sanitizes secret-like fields from diagnostic events', () => {
    const clean = sanitizeDiagnosticEvent({
      code: RESULT_CODES.AUTH_ERROR,
      message: 'bad',
      apiKey: 'secret',
      authorization: 'Bearer x',
    });
    expect(clean.apiKey).toBeUndefined();
    expect(clean.authorization).toBeUndefined();
    expect(clean.code).toBe(RESULT_CODES.AUTH_ERROR);
  });
});
