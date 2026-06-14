import { describe, it, expect } from 'vitest';
import {
  createGeneratedArtifactV1,
  normalizeGeneratedArtifactV1,
  GENERATED_ARTIFACT_TYPES,
  generatedArtifactToOperational,
} from './generatedArtifactAuthority.js';

describe('generatedArtifactAuthority', () => {
  it('normalizes required V1 fields', () => {
    const record = createGeneratedArtifactV1({
      artifactType: 'generated_video',
      missionId: 'm-1',
      ownerUserId: 'u-1',
      source: 'video_generate',
      status: 'ready',
      url: 'https://cdn.example.com/v.mp4',
    });
    expect(record.artifactId).toMatch(/^gart-/);
    expect(record.missionId).toBe('m-1');
    expect(record.ownerUserId).toBe('u-1');
    expect(record.artifactType).toBe('generated_video');
    expect(record.url).toBe('https://cdn.example.com/v.mp4');
    expect(record.createdAt).toBeTruthy();
    expect(record.updatedAt).toBeTruthy();
  });

  it('rejects unknown artifact types', () => {
    expect(
      normalizeGeneratedArtifactV1({
        artifactType: 'orphan_url',
        missionId: 'm-1',
        ownerUserId: 'u-1',
      }),
    ).toBeNull();
  });

  it('maps V1 types to operational contract', () => {
    for (const artifactType of GENERATED_ARTIFACT_TYPES) {
      const record = createGeneratedArtifactV1({
        artifactType,
        missionId: 'm-1',
        ownerUserId: 'u-1',
        source: 'test',
        status: 'ready',
        url: 'https://cdn.example.com/x',
      });
      const op = generatedArtifactToOperational(record);
      expect(op.id).toBe(record.artifactId);
      expect(op.missionId).toBe('m-1');
      expect(op.subtype).toBe(artifactType);
    }
  });
});
