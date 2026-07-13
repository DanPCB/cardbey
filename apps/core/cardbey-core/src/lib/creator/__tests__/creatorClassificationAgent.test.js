import { describe, it, expect } from 'vitest';
import {
  classifyCreatorContent,
  validateClassificationEvidence,
} from '../../../agents/creatorClassification/CreatorClassificationAgent.js';
import { routeStatusAfterClassification } from '../publishing/creatorPublishingTypes.js';

describe('CreatorClassificationAgent', () => {
  const baseEvidence = {
    contentId: 'c1',
    creatorId: 'cr1',
    declaredType: 'VIDEO',
    title: 'How to brew specialty coffee at home',
    description: 'A detailed tutorial on pour-over coffee techniques for beginners.',
    language: 'en',
    mediaAsset: {
      assetId: 'asset1',
      mediaUrl: '/uploads/videos/test.mp4',
      posterUrl: '/uploads/thumb.jpg',
      durationSeconds: 120,
    },
    creatorContext: { trustScore: 0.8, previousRejections: 0, accountAgeDays: 90 },
  };

  it('validates complete video evidence', () => {
    const result = validateClassificationEvidence(baseEvidence);
    expect(result.complete).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks incomplete evidence', () => {
    const result = validateClassificationEvidence({ ...baseEvidence, title: '' });
    expect(result.complete).toBe(false);
    expect(result.blockers).toContain('missing_title');
  });

  it('returns structured classification result', () => {
    const result = classifyCreatorContent(baseEvidence);
    expect(result.incomplete).toBeFalsy();
    expect(result.classificationId).toBeTruthy();
    expect(result.detectedType).toBe('VIDEO');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.recommendation).toBeTruthy();
    expect(result.risk.overall).toBeTruthy();
    expect(result.suggestedDestinations.length).toBeGreaterThan(0);
  });

  it('routes low-risk ready recommendation to ready_to_publish', () => {
    const status = routeStatusAfterClassification('READY_TO_PUBLISH', { overall: 'LOW' });
    expect(status).toBe('ready_to_publish');
  });

  it('routes high risk ready recommendation to escalated', () => {
    const status = routeStatusAfterClassification('READY_TO_PUBLISH', { overall: 'HIGH' });
    expect(status).toBe('escalated');
  });

  it('does not include raw chain-of-thought fields', () => {
    const result = classifyCreatorContent(baseEvidence);
    expect(result).not.toHaveProperty('chainOfThought');
    expect(result.summary).toBeTruthy();
  });
});
