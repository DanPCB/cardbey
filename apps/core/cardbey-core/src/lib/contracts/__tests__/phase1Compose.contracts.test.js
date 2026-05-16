/**
 * Phase 1 — pure composer matches golden BuildStoreInputV1 per runway story.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { composeBuildStoreInputV1FromFields } from '../buildStoreInputV1.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(__dirname, '..', '__fixtures__', 'golden');

function readGolden(name) {
  const p = path.join(GOLDEN_DIR, name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

describe('Phase 1 — composeBuildStoreInputV1FromFields ↔ golden fixtures', () => {
  it('R2 intake autosubmit + R3 mission run (same Northside story)', () => {
    const gIntake = readGolden('buildStoreInput-intake-autosubmit.json');
    const gMission = readGolden('buildStoreInput-mission-pipeline-run.json');
    const out = composeBuildStoreInputV1FromFields({
      businessName: 'Northside Coffee',
      businessType: 'cafe',
      storeType: 'cafe',
      location: 'Melbourne',
      intentMode: 'store',
      rawUserText: 'Create a store for Northside Coffee in Melbourne',
    });
    expect(out).toEqual(gIntake.buildStoreInput);
    expect(out).toEqual(gMission.buildStoreInput);
  });

  it('R4 MI orchestra start', () => {
    const golden = readGolden('buildStoreInput-orchestra-start.json');
    const out = composeBuildStoreInputV1FromFields({
      businessName: 'Northside Coffee',
      businessType: 'cafe',
      storeType: 'cafe',
      location: 'Melbourne',
      intentMode: 'store',
      rawUserText: 'Northside Coffee, cafe, Melbourne',
      sourceType: 'form',
    });
    expect(out).toEqual(golden.buildStoreInput);
  });

  it('R5a business API', () => {
    const golden = readGolden('buildStoreInput-business-api.json');
    const out = composeBuildStoreInputV1FromFields({
      businessName: 'Northside Coffee',
      businessType: 'cafe',
      storeType: 'cafe',
      location: 'Melbourne',
      intentMode: 'store',
      rawUserText: 'Northside Coffee, cafe, Melbourne',
    });
    expect(out).toEqual(golden.buildStoreInput);
  });

  it('R5b operator start_build_store', () => {
    const golden = readGolden('buildStoreInput-operator-tool.json');
    const out = composeBuildStoreInputV1FromFields({
      businessName: 'Northside Coffee',
      businessType: 'cafe',
      storeType: 'cafe',
      location: 'Melbourne',
      intentMode: 'store',
      rawUserText: 'Create my store',
    });
    expect(out).toEqual(golden.buildStoreInput);
  });
});
