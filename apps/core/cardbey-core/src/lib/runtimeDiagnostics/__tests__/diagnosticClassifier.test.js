import { describe, it, expect } from 'vitest';
import { classifyRuntimeDiagnostic } from '../diagnosticClassifier.js';

describe('diagnosticClassifier', () => {
  it('detects media_cors_blocked', () => {
    const result = classifyRuntimeDiagnostic({
      eventName: 'hero_video_cors_blocked',
      message: 'Cross-Origin Request Blocked OpaqueResponseBlocking',
      category: 'media',
      evidence: {
        url: 'https://media.cardbey.com/uploads/hero.mp4',
        readyState: 0,
        networkState: 3,
      },
    });

    expect(result.kind).toBe('media_cors_blocked');
    expect(result.layer).toBe('cdn');
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.excludedCauses).toContain('upload_failure');
  });

  it('detects deploy_version_mismatch', () => {
    const result = classifyRuntimeDiagnostic({
      eventName: 'deploy_version_mismatch',
      message: 'Dashboard commit differs from core',
      category: 'deployment',
      evidence: {
        frontendCommitSha: 'abc',
        backendCommitSha: 'def',
      },
    });

    expect(result.kind).toBe('deploy_version_mismatch');
    expect(result.layer).toBe('deployment');
  });

  it('detects storage_upload_failed', () => {
    const result = classifyRuntimeDiagnostic({
      eventName: 'hero_upload_failure',
      message: 'AccessDenied on R2 put',
      category: 'storage',
      evidence: { status: 500 },
    });

    expect(result.kind).toBe('storage_upload_failed');
    expect(result.layer).toBe('storage');
  });
});
