/**
 * Load price ladder from data/price-ladders/*.json by businessType and region.
 * NODE-ONLY — do not import from client. Uses fs.
 * Returns null if file is missing; throws only on JSON parse errors.
 */

import fs from 'fs';
import path from 'path';
import type { PriceLadder } from '../priceLadder.js';

const LADDERS_DIR = path.resolve(process.cwd(), 'data', 'price-ladders');

/**
 * Load price ladder for (businessType, region).
 * Path: data/price-ladders/{businessType}_{region}.json (lowercase).
 * Returns null if file does not exist. Throws on JSON parse errors.
 */
export function loadPriceLadder(businessType: string, region: string): PriceLadder | null {
  const normalized = `${String(businessType).trim().toLowerCase().replace(/\s+/g, '_')}_${String(region).trim().toLowerCase()}`;
  const filePath = path.join(LADDERS_DIR, `${normalized}.json`);
  if (!fs.existsSync(filePath)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    throw new SyntaxError(`Invalid JSON in price ladder ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.businessType !== 'string' || typeof o.region !== 'string' || typeof o.currency !== 'string') return null;
  if (typeof o.byCategoryKey !== 'object' || o.byCategoryKey == null) return null;
  return raw as PriceLadder;
}
