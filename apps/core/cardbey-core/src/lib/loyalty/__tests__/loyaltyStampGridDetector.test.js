/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  clusterLinePositions,
  commonLoyaltyDimensionBonus,
  detectEdges,
  estimateStampThreshold,
  generateGridCandidates,
  projectLineEnergy,
  scoreGridCandidate,
} from '../loyaltyStampGridDetector.js';

describe('loyaltyStampGridDetector', () => {
  it('clusters line peaks from projections', () => {
    const projection = new Float32Array(100);
    for (let i = 0; i < 100; i += 25) projection[i] = 10;
    projection[50] = 12;
    const lines = clusterLinePositions(projection, 4);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('prefers common loyalty dimensions in scoring', () => {
    expect(commonLoyaltyDimensionBonus(2, 5)).toBe(1);
    expect(commonLoyaltyDimensionBonus(9, 9)).toBe(0.25);
  });

  it('scores regular grid candidates higher', () => {
    const image = { width: 500, height: 200 };
    const good = scoreGridCandidate(
      {
        rows: 2,
        columns: 5,
        horizontalLines: [0, 100, 200],
        verticalLines: [0, 100, 200, 300, 400, 500],
        cells: Array.from({ length: 10 }, (_, i) => ({ isReward: i % 5 === 4 })),
      },
      image,
    );
    const weak = scoreGridCandidate(
      {
        rows: 9,
        columns: 9,
        horizontalLines: [0, 22, 44],
        verticalLines: [0, 50],
        cells: [],
      },
      image,
    );
    expect(good).toBeGreaterThan(weak);
  });

  it('generates common dimension candidates', () => {
    const candidates = generateGridCandidates([], [], { width: 400, height: 160 });
    expect(candidates.some((c) => c.rows === 2 && c.columns === 5)).toBe(true);
    expect(candidates.some((c) => c.rows === 4 && c.columns === 8)).toBe(true);
  });

  it('estimates stamp threshold from purchase cells', () => {
    const cells = [
      { filled: true, isReward: false },
      { filled: true, isReward: false },
      { filled: false, isReward: false },
      { filled: true, isReward: true },
    ];
    expect(estimateStampThreshold(cells)).toBe(2);
  });

  it('detects edges on synthetic gradient block', () => {
    const width = 20;
    const height = 10;
    const gray = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        gray[y * width + x] = x < 10 ? 40 : 200;
      }
    }
    const edges = detectEdges(gray, width, height);
    const { vertical } = projectLineEnergy(edges, width, height);
    const peakCol = vertical.indexOf(Math.max(...vertical));
    expect(peakCol).toBeGreaterThan(4);
    expect(peakCol).toBeLessThan(14);
  });
});
