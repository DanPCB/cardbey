/**
 * Classical CV stamp-grid detector for loyalty cards (sharp-based, no OpenCV dependency).
 * Geometry-first: rows × columns, cell roles, ink density, reward column heuristics.
 */

import fetch from 'node-fetch';
import { extractOcrFooterText } from './loyaltyOcrTopologyParser.js';

let sharp = null;

async function getSharp() {
  if (sharp) return sharp;
  try {
    const mod = await import('sharp');
    sharp = mod.default;
    return sharp;
  } catch (err) {
    console.warn('[loyaltyStampGridDetector] sharp unavailable:', err?.message ?? err);
    return null;
  }
}

/** Common loyalty stamp-card layouts (rows × columns). */
export const COMMON_LOYALTY_DIMENSIONS = Object.freeze([
  [2, 5],
  [2, 6],
  [3, 5],
  [4, 7],
  [4, 8],
  [5, 5],
  [2, 10],
  [3, 10],
  [4, 5],
  [1, 10],
]);

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * @param {string} imageUrl
 */
export async function downloadImageBuffer(imageUrl) {
  const ref = String(imageUrl ?? '').trim();
  if (!ref) throw new Error('IMAGE_URL_REQUIRED');

  if (ref.startsWith('data:')) {
    const comma = ref.indexOf(',');
    if (comma < 0) throw new Error('INVALID_DATA_URL');
    return Buffer.from(ref.slice(comma + 1), 'base64');
  }

  const response = await fetch(ref, {
    headers: { 'User-Agent': 'Cardbey-LoyaltyGrid/1.0' },
  });
  if (!response.ok) {
    throw new Error(`IMAGE_DOWNLOAD_FAILED:${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * @param {Buffer} buffer
 */
export async function preprocessImage(buffer) {
  const lib = await getSharp();
  if (!lib) throw new Error('SHARP_UNAVAILABLE');

  const pipeline = lib(buffer).rotate().resize({
    width: 1200,
    height: 1200,
    fit: 'inside',
    withoutEnlargement: false,
  });

  const { data, info } = await pipeline
    .normalize()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    channels: info.channels,
    gray: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  };
}

/**
 * Sobel edge magnitude per pixel.
 *
 * @param {Uint8Array} gray
 * @param {number} width
 * @param {number} height
 */
export function detectEdges(gray, width, height) {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const gx =
        -gray[idx - width - 1] +
        gray[idx - width + 1] +
        -2 * gray[idx - 1] +
        2 * gray[idx + 1] +
        -gray[idx + width - 1] +
        gray[idx + width + 1];
      const gy =
        -gray[idx - width - 1] -
        2 * gray[idx - width] -
        gray[idx - width + 1] +
        gray[idx + width - 1] +
        2 * gray[idx + width] +
        gray[idx + width + 1];
      out[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

/**
 * @param {Float32Array} edges
 * @param {number} width
 * @param {number} height
 */
export function projectLineEnergy(edges, width, height) {
  const horizontal = new Float32Array(height);
  const vertical = new Float32Array(width);

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = 0; x < width; x += 1) sum += edges[y * width + x];
    horizontal[y] = sum / width;
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = 0; y < height; y += 1) sum += edges[y * width + x];
    vertical[x] = sum / height;
  }

  return { horizontal, vertical };
}

/**
 * @param {Float32Array} projection
 * @param {number} minGap
 */
export function clusterLinePositions(projection, minGap = 8) {
  const peaks = [];
  const len = projection.length;
  let threshold = 0;
  for (let i = 0; i < len; i += 1) threshold += projection[i];
  threshold = (threshold / len) * 1.35;

  for (let i = 1; i < len - 1; i += 1) {
    if (
      projection[i] > threshold &&
      projection[i] >= projection[i - 1] &&
      projection[i] >= projection[i + 1]
    ) {
      peaks.push(i);
    }
  }

  if (!peaks.length) return [];

  /** @type {number[]} */
  const clusters = [];
  let group = [peaks[0]];
  for (let i = 1; i < peaks.length; i += 1) {
    if (peaks[i] - peaks[i - 1] <= minGap) {
      group.push(peaks[i]);
    } else {
      clusters.push(Math.round(group.reduce((a, b) => a + b, 0) / group.length));
      group = [peaks[i]];
    }
  }
  clusters.push(Math.round(group.reduce((a, b) => a + b, 0) / group.length));
  return clusters;
}

/**
 * @param {number[]} positions
 * @param {number} extent
 */
function regularityScore(positions, extent) {
  if (positions.length < 2) return 0.35;
  const gaps = [];
  for (let i = 1; i < positions.length; i += 1) gaps.push(positions[i] - positions[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance =
    gaps.reduce((acc, g) => acc + (g - mean) ** 2, 0) / Math.max(1, gaps.length);
  const cv = Math.sqrt(variance) / Math.max(1, mean);
  const coverage = (positions[positions.length - 1] - positions[0]) / Math.max(1, extent);
  return Math.max(0, Math.min(1, (1 - cv) * 0.7 + coverage * 0.3));
}

/**
 * @param {number} rows
 * @param {number} columns
 */
export function commonLoyaltyDimensionBonus(rows, columns) {
  return COMMON_LOYALTY_DIMENSIONS.some(([r, c]) => r === rows && c === columns) ? 1 : 0.25;
}

/**
 * @param {{ rows: number; columns: number; cells?: Array<{ isReward?: boolean }> }} candidate
 */
export function rewardCellPatternBonus(candidate) {
  const cells = candidate.cells ?? [];
  if (!cells.length) return 0.5;
  const rewards = cells.filter((c) => c.isReward).length;
  const ratio = rewards / cells.length;
  if (ratio > 0 && ratio <= 0.25) return 1;
  if (ratio === 0) return 0.4;
  return 0.6;
}

/**
 * @param {{
 *   rows: number;
 *   columns: number;
 *   horizontalLines: number[];
 *   verticalLines: number[];
 *   cells?: Array<{ isReward?: boolean }>;
 * }} candidate
 * @param {{ width: number; height: number }} image
 */
export function scoreGridCandidate(candidate, image) {
  let score = 0;
  score += regularityScore(candidate.horizontalLines, image.height) * 0.4;
  score += regularityScore(candidate.verticalLines, image.width) * 0.4;
  score += commonLoyaltyDimensionBonus(candidate.rows, candidate.columns) * 0.15;
  score += rewardCellPatternBonus(candidate) * 0.05;
  return Math.min(1, score);
}

/**
 * @param {number[]} hLines
 * @param {number[]} vLines
 * @param {{ width: number; height: number }} image
 */
export function generateGridCandidates(hLines, vLines, image) {
  /** @type {Array<{ rows: number; columns: number; horizontalLines: number[]; verticalLines: number[]; score?: number }>} */
  const fromLines = [];

  const hInterior = Math.max(0, hLines.length - 1);
  const vInterior = Math.max(0, vLines.length - 1);
  if (hInterior >= 1 && vInterior >= 1) {
    fromLines.push({
      rows: hInterior,
      columns: vInterior,
      horizontalLines: hLines,
      verticalLines: vLines,
    });
  }

  for (const [rows, columns] of COMMON_LOYALTY_DIMENSIONS) {
    fromLines.push({
      rows,
      columns,
      horizontalLines: evenlySpacedLines(image.height, rows + 1),
      verticalLines: evenlySpacedLines(image.width, columns + 1),
    });
  }

  const seen = new Set();
  return fromLines.filter((c) => {
    const key = `${c.rows}x${c.columns}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {number} extent
 * @param {number} count
 */
function evenlySpacedLines(extent, count) {
  const lines = [];
  for (let i = 0; i < count; i += 1) {
    lines.push(Math.round((i * extent) / Math.max(1, count - 1)));
  }
  return lines;
}

/**
 * @param {Uint8Array} gray
 * @param {number} width
 * @param {number} height
 * @param {number} row
 * @param {number} col
 * @param {number} rows
 * @param {number} cols
 */
function extractCellRegion(gray, width, height, row, col, rows, cols) {
  const left = Math.floor((col * width) / cols);
  const right = Math.floor(((col + 1) * width) / cols);
  const top = Math.floor((row * height) / rows);
  const bottom = Math.floor(((row + 1) * height) / rows);
  const padX = Math.floor((right - left) * 0.12);
  const padY = Math.floor((bottom - top) * 0.12);
  const x0 = Math.max(0, left + padX);
  const x1 = Math.min(width, right - padX);
  const y0 = Math.max(0, top + padY);
  const y1 = Math.min(height, bottom - padY);

  let sum = 0;
  let count = 0;
  let edgeSum = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const v = gray[y * width + x];
      sum += v;
      count += 1;
      if (x > x0 && y > y0) {
        edgeSum += Math.abs(v - gray[y * width + (x - 1)]);
      }
    }
  }
  const mean = count ? sum / count : 255;
  const edgeDensity = count ? edgeSum / count : 0;
  return { mean, edgeDensity, darkness: 1 - mean / 255 };
}

/**
 * @param {{ mean: number; edgeDensity: number; darkness: number }} region
 */
export function isCellStamped(region) {
  return region.darkness > 0.22 || region.edgeDensity > 18;
}

/**
 * @param {{ mean: number; edgeDensity: number; darkness: number }} region
 * @param {number} column
 * @param {number} columns
 */
export function isRewardCell(region, column, columns) {
  if (column === columns - 1) return true;
  return region.edgeDensity > 28 && region.darkness > 0.15;
}

/**
 * @param {Uint8Array} gray
 * @param {number} width
 * @param {number} height
 * @param {number} rows
 * @param {number} cols
 */
export async function analyzeCells(gray, width, height, rows, cols) {
  /** @type {Array<{ row: number; column: number; filled: boolean; isReward: boolean; darkness: number }>} */
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const region = extractCellRegion(gray, width, height, r, c, rows, cols);
      const reward = isRewardCell(region, c, cols);
      const filled = reward || isCellStamped(region);
      cells.push({
        row: r,
        column: c,
        filled,
        isReward: reward,
        darkness: region.darkness,
      });
    }
  }
  return cells;
}

/**
 * @param {Array<{ filled: boolean }>} cells
 */
export function estimateStampThreshold(cells) {
  const purchaseFilled = cells.filter((c) => c.filled && !c.isReward).length;
  const rewardCount = cells.filter((c) => c.isReward).length;
  if (purchaseFilled > 0) return purchaseFilled;
  const purchases = cells.filter((c) => !c.isReward).length;
  const rewards = Math.max(1, rewardCount);
  return Math.max(1, purchases - rewards);
}

/**
 * @param {{ rows: number; columns: number; cells: Array<{ isReward?: boolean }> }} grid
 * @param {{ score: number }} best
 * @param {Array<{ filled: boolean }>} cells
 */
export function calculateGridConfidence(best, cells) {
  const filledRatio = cells.filter((c) => c.filled).length / Math.max(1, cells.length);
  const rewardRatio = cells.filter((c) => c.isReward).length / Math.max(1, cells.length);
  const structure = Math.min(1, best.score ?? 0.5);
  const inkSignal = Math.min(1, filledRatio * 1.2);
  const rewardSignal = rewardRatio > 0 && rewardRatio < 0.35 ? 1 : 0.6;
  return Math.min(0.95, structure * 0.55 + inkSignal * 0.3 + rewardSignal * 0.15);
}

/**
 * @param {{ width: number; height: number; gray: Uint8Array }} processed
 */
export async function detectStampGrid(processed) {
  const { width, height, gray } = processed;
  const edges = detectEdges(gray, width, height);
  const { horizontal, vertical } = projectLineEnergy(edges, width, height);

  const hLines = clusterLinePositions(horizontal, Math.max(6, Math.floor(height / 30)));
  const vLines = clusterLinePositions(vertical, Math.max(6, Math.floor(width / 30)));

  const candidates = generateGridCandidates(hLines, vLines, processed);
  let best = { rows: 2, columns: 5, horizontalLines: [], verticalLines: [], score: 0 };

  for (const candidate of candidates) {
    const cells = await analyzeCells(gray, width, height, candidate.rows, candidate.columns);
    const score = scoreGridCandidate({ ...candidate, cells }, processed);
    if (score > (best.score ?? 0)) {
      best = { ...candidate, score, cells };
    }
  }

  if (!best.cells) {
    best.cells = await analyzeCells(gray, width, height, best.rows, best.columns);
  }

  const filledRatio = best.cells.filter((c) => c.filled).length / Math.max(1, best.cells.length);
  const confidence = calculateGridConfidence(best, best.cells);

  return {
    rows: best.rows,
    columns: best.columns,
    cells: best.cells,
    filledRatio,
    confidence,
    horizontalLines: best.horizontalLines,
    verticalLines: best.verticalLines,
  };
}

/**
 * @param {{ width: number; height: number; gray: Uint8Array }} processed
 * @param {string | null} [ocrHint]
 */
export function detectFooterText(processed, ocrHint = null) {
  if (ocrHint) {
    const footer = extractOcrFooterText(ocrHint);
    if (footer) {
      return { text: footer, confidence: 0.85, source: 'ocr_footer' };
    }
  }

  const { width, height, gray } = processed;
  const bandTop = Math.floor(height * 0.88);
  let darkPixels = 0;
  let total = 0;
  for (let y = bandTop; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (gray[y * width + x] < 120) darkPixels += 1;
      total += 1;
    }
  }
  const density = total ? darkPixels / total : 0;
  if (density > 0.04) {
    return { text: null, confidence: 0.45, source: 'visual_footer_band', density };
  }
  return { text: null, confidence: 0.2, source: 'none' };
}

/**
 * @param {Array<{ row: number; column: number; isReward: boolean }>} cells
 */
export function detectRewardCells(cells) {
  return cells.filter((c) => c.isReward).map((c) => ({ row: c.row, column: c.column }));
}

/**
 * @param {string} imageUrl
 * @param {{ ocrText?: string | null }} [options]
 */
export async function detectStampGridFromImage(imageUrl, options = {}) {
  const buffer = await downloadImageBuffer(imageUrl);
  const processed = await preprocessImage(buffer);
  const grid = await detectStampGrid(processed);
  const footer = detectFooterText(processed, options.ocrText ?? null);
  const rewardCells = detectRewardCells(grid.cells);

  const confidence = Math.min(
    0.95,
    grid.confidence * 0.7 + (footer.confidence ?? 0.2) * 0.3,
  );

  return {
    success: confidence > 0.5,
    rows: grid.rows,
    columns: grid.columns,
    layout: `${grid.rows}x${grid.columns}`,
    estimatedThreshold: estimateStampThreshold(grid.cells),
    rewardCells,
    footerText: footer.text,
    confidence,
    source: 'visual_grid_detector',
    rawGrid: grid,
    debug: {
      cellCount: grid.cells.length,
      filledRatio: grid.filledRatio,
      footerSource: footer.source,
    },
  };
}
