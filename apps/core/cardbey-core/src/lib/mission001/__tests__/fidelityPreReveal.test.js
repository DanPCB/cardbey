/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assessPreRevealFidelity,
  enrichImageQueryWithBusinessContext,
  planTargetedRepair,
  selectRepairTargets,
} from '../fidelityPreReveal.js';

describe('Mission001 Gates 5–7 — fidelity pre-reveal', () => {
  const prevMaster = process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
  const prevGate = process.env.ENABLE_MISSION_001_FIDELITY_GATE_V1;

  beforeEach(() => {
    process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = '1';
    process.env.ENABLE_MISSION_001_FIDELITY_GATE_V1 = '1';
    process.env.ENABLE_MISSION_001_TARGETED_REPAIR_V1 = '1';
    process.env.ENABLE_MISSION_001_IMAGE_FIDELITY_V1 = '1';
  });

  afterEach(() => {
    if (prevMaster === undefined) delete process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
    else process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = prevMaster;
    if (prevGate === undefined) delete process.env.ENABLE_MISSION_001_FIDELITY_GATE_V1;
    else process.env.ENABLE_MISSION_001_FIDELITY_GATE_V1 = prevGate;
  });

  it('flags critical catalog scaffold failures', () => {
    const assessment = assessPreRevealFidelity(
      {
        storeName: 'Anison Capital',
        storeType: 'financial planner',
        items: [{ name: 'Core Service' }, { name: 'Premium Package' }],
        website: { sections: [] },
      },
      {
        ctx: { primaryCategory: 'financial planner', verticalSlug: 'professional.finance' },
        fidelityScore: { overall: 42, identity: 95, catalog: 35, media: 42, branding: 55, blockers: [] },
      },
    );
    expect(assessment.enabled).toBe(true);
    expect(assessment.repairTargets).toContain('catalog');
    expect(selectRepairTargets(assessment.failures, assessment.fidelity)).toContain('images');
  });

  it('plans bounded targeted repair without identity regeneration', () => {
    const assessment = {
      hasCritical: false,
      repairTargets: ['images', 'composition'],
    };
    const plan = planTargetedRepair(assessment, 0);
    expect(plan.shouldRepair).toBe(true);
    expect(plan.targets).toEqual(['images', 'composition']);
    expect(planTargetedRepair(assessment, 2).exhausted).toBe(true);
  });

  it('enriches weak image queries with business context', () => {
    const q = enrichImageQueryWithBusinessContext('door', {
      businessName: 'Secure Doors Melbourne',
      businessType: 'security installation',
      location: 'Melbourne VIC',
    });
    expect(q.toLowerCase()).toContain('door');
    expect(q.toLowerCase()).toContain('melbourne');
  });
});
