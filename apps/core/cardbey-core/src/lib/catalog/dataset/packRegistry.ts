/**
 * Starter pack registry: list and load pack JSON files from data/starter-packs.
 * NODE-ONLY — do not import from client. Uses fs and path.
 * Paths are resolved from process.cwd(); run from apps/core/cardbey-core so data/ exists.
 */

import fs from 'fs';
import path from 'path';
import { loadPackFromJson } from '../packLoader.js';
import type { LoadedPack } from '../packLoader.js';

const PACKS_DIR = path.resolve(process.cwd(), 'data', 'starter-packs');

/**
 * Returns list of JSON file paths under data/starter-packs.
 * Node only (uses fs.readdirSync).
 */
export function getAvailableStarterPackFiles(): string[] {
  if (!fs.existsSync(PACKS_DIR)) return [];
  const files = fs.readdirSync(PACKS_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => path.join(PACKS_DIR, f));
}

/**
 * Load a starter pack from a file path. Uses loadPackFromJson (validates and normalizes).
 * Node only (uses fs.readFileSync).
 */
export function loadStarterPackFromFile(filePath: string): LoadedPack {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return loadPackFromJson(raw);
}
