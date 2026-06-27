/**
 * Intake V1 deprecation helpers.
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import {
  applyIntakeV1DeprecationHeaders,
  logIntakeV1Deprecation,
  INTAKE_V1_CANONICAL_PATH,
} from '../intakeV1Deprecation.js';

describe('intakeV1Deprecation', () => {
  it('sets RFC-style deprecation headers', () => {
    const headers = {};
    const res = {
      setHeader: (key, value) => {
        headers[key.toLowerCase()] = value;
      },
    };
    applyIntakeV1DeprecationHeaders(res);
    expect(headers.deprecation).toBe('true');
    expect(headers['x-api-deprecated']).toContain(INTAKE_V1_CANONICAL_PATH);
    expect(headers.link).toContain(INTAKE_V1_CANONICAL_PATH);
  });

  it('logs structured deprecation warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logIntakeV1Deprecation({
      method: 'POST',
      originalUrl: '/api/performer/intake',
      user: { id: 'user-1' },
    });
    expect(warn).toHaveBeenCalledWith(
      '[intake-v1-deprecated]',
      expect.objectContaining({
        method: 'POST',
        path: '/api/performer/intake',
        canonical: `POST ${INTAKE_V1_CANONICAL_PATH}`,
        actorId: 'user-1',
      }),
    );
    warn.mockRestore();
  });
});
