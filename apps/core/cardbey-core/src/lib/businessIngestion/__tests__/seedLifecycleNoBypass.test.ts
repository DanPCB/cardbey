/**
 * Proves no direct Discovery → Store or QA → Store bypass paths exist.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISCOVERY_PIPELINE_GOVERNANCE } from '../../discoveryEngine/governance/runtimeAuthority.js';
import { GOVERNED_NON_STORE_ACTIONS } from '../seedLifecycleGovernance.js';
import { canTransitionSeedStatus } from '../SeedGovernance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_LIB = path.resolve(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(path.join(CORE_LIB, relativePath), 'utf8');
}

describe('seed lifecycle no-bypass governance', () => {
  it('discovery pipeline governance forbids store persistence', () => {
    expect(DISCOVERY_PIPELINE_GOVERNANCE.persistStores).toBe(false);
    expect(DISCOVERY_PIPELINE_GOVERNANCE.persistSeeds).toBe(true);
  });

  it('QA approve transitions only to seeded_claimable (not active)', () => {
    expect(canTransitionSeedStatus('seeded_pending_qa', 'seeded_claimable')).toBe(true);
    expect(canTransitionSeedStatus('seeded_pending_qa', 'active')).toBe(false);
    expect(canTransitionSeedStatus('seeded_pending_qa', 'verified_owner')).toBe(false);
  });

  it('claim verify transitions to verified_owner only (not active)', () => {
    expect(canTransitionSeedStatus('claim_pending', 'verified_owner')).toBe(true);
    expect(canTransitionSeedStatus('claim_pending', 'active')).toBe(false);
  });

  it('only verified_owner can transition to active (runtime activation gate)', () => {
    expect(canTransitionSeedStatus('verified_owner', 'active')).toBe(true);
    expect(canTransitionSeedStatus('seeded_claimable', 'active')).toBe(false);
    expect(canTransitionSeedStatus('claim_pending', 'active')).toBe(false);
    expect(canTransitionSeedStatus('seeded_pending_qa', 'active')).toBe(false);
  });

  it('QaPromotionService does not import store persistence', () => {
    const src = readSource('businessIngestion/QaPromotionService.ts');
    expect(src).not.toMatch(/transferSeedStoreToOwner|persistSeedStoreDraft|seedStorePersistence/);
  });

  it('DiscoveryPromotionPipeline uses persistStores false', () => {
    const src = readSource('discoveryEngine/pipelines/DiscoveryPromotionPipeline.ts');
    expect(src).toMatch(/persistStores:\s*false/);
    expect(src).not.toMatch(/persistStores:\s*true/);
  });

  it('activation_confirmed is not a non-store action', () => {
    expect(GOVERNED_NON_STORE_ACTIONS.has('activation_confirmed')).toBe(false);
    expect(GOVERNED_NON_STORE_ACTIONS.has('discovery_ingested')).toBe(true);
    expect(GOVERNED_NON_STORE_ACTIONS.has('qa_approve')).toBe(true);
  });

  it('ActivationRunwayService delegates store creation to activateSeedAfterOwnerConfirmation', () => {
    const src = readSource('businessIngestion/ActivationRunwayService.ts');
    expect(src).toMatch(/activateSeedAfterOwnerConfirmation/);
  });
});
