import { describe, expect, it, vi } from 'vitest';
import {
  isArtifactCheckpointDeferredRespond,
  isArtifactCheckpointResolved,
  recordHeroArtifactCheckpoint,
  shouldBlockStoreBuildForMissingArtifact,
} from './artifactCheckpointAuthority.js';

describe('artifactCheckpointAuthority', () => {
  it('defers logo upload/library without logoUrl', () => {
    expect(isArtifactCheckpointDeferredRespond('logoChoice', 'Upload now', {})).toBe(true);
    expect(isArtifactCheckpointDeferredRespond('logoChoice', 'Choose from library', {})).toBe(true);
  });

  it('allows logo respond when logoUrl present', () => {
    expect(
      isArtifactCheckpointDeferredRespond('logoChoice', 'Upload now', {
        logoUrl: 'https://cdn.example/logo.png',
      }),
    ).toBe(false);
  });

  it('allows Skip without artifact payload', () => {
    expect(isArtifactCheckpointDeferredRespond('logoChoice', 'Skip', {})).toBe(false);
  });

  it('defers hero video upload without videoUrl', () => {
    expect(isArtifactCheckpointDeferredRespond('heroVideoChoice', 'Upload file', {})).toBe(true);
    expect(
      isArtifactCheckpointDeferredRespond('heroVideoChoice', 'Upload file', {
        videoUrl: 'https://cdn.example/hero.mp4',
      }),
    ).toBe(false);
  });

  it('defers graphic library selection without assetUrl', () => {
    expect(isArtifactCheckpointDeferredRespond('graphicChoice', 'Choose from library', {})).toBe(true);
    expect(
      isArtifactCheckpointDeferredRespond('graphicChoice', 'Choose from library', {
        assetUrl: 'https://cdn.example/graphic.png',
      }),
    ).toBe(false);
  });

  it('resolves checkpoint only with artifact or skip', () => {
    expect(isArtifactCheckpointResolved('logoChoice', 'Upload now', {})).toBe(false);
    expect(
      isArtifactCheckpointResolved('logoChoice', 'Upload now', { logoUrl: 'https://cdn.example/l.png' }),
    ).toBe(true);
    expect(isArtifactCheckpointResolved('logoChoice', 'Skip', { logoUploadStatus: 'skipped' })).toBe(true);
  });

  it('blocks store build when upload path chosen without artifact', () => {
    expect(
      shouldBlockStoreBuildForMissingArtifact({ logoChoice: 'Upload now' }).blocked,
    ).toBe(true);
    expect(
      shouldBlockStoreBuildForMissingArtifact({
        logoChoice: 'Upload now',
        logoUrl: 'https://cdn.example/logo.png',
      }).blocked,
    ).toBe(false);
    expect(shouldBlockStoreBuildForMissingArtifact({ logoChoice: 'Skip' }).blocked).toBe(false);
  });

  it('records hero video on mission pipeline outputsJson', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      missionPipeline: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'mission-1',
          outputsJson: { heroVideoChoice: 'Upload file' },
        }),
        update,
      },
    };

    const result = await recordHeroArtifactCheckpoint(prisma, {
      missionId: 'mission-1',
      heroVideoUrl: '/uploads/hero.mp4',
      heroMediaType: 'video',
    });

    expect(result.recorded).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'mission-1' },
      data: {
        outputsJson: expect.objectContaining({
          heroVideoUrl: '/uploads/hero.mp4',
          videoUrl: '/uploads/hero.mp4',
          heroUploadStatus: 'uploaded',
        }),
      },
    });
  });
});
