import { describe, it, expect } from 'vitest';
import {
  buildTurnBeliefFromIntake,
  identitiesHardConflict,
  extractGoalBusinessName,
  extractEvidenceBusinessName,
  identityTokens,
  PERFORMER_STATUS,
  turnBeliefAllowsDispatch,
} from '../index.js';

describe('P1 buildTurnBeliefFromIntake', () => {
  it('diacritic brand tokens still conflict (Mộc vs PTH)', () => {
    expect(identitiesHardConflict('Mộc', 'PTH INTERNATIONAL FURNITURE')).toBe(true);
    expect(identityTokens('Mộc')).toContain('moc');
  });

  it('coffee logo vs NOODLE goal → BLOCKED hard conflict', () => {
    const belief = buildTurnBeliefFromIntake({
      goal: 'Create store: NOODLE',
      businessName: 'NOODLE',
      ocrText: 'Coffee\nYour Creative Slogan',
    });
    expect(identitiesHardConflict('NOODLE', 'Coffee')).toBe(true);
    expect(belief.status).toBe(PERFORMER_STATUS.BLOCKED);
    expect(belief.conflicts.some((c) => c.code === 'IDENTITY_GOAL_MISMATCH')).toBe(true);
    expect(turnBeliefAllowsDispatch(belief)).toBe(false);
    expect(belief.userVisibleSummary).toMatch(/conflict/i);
  });

  it('OCR brand wins over conflicting BUE invent name', () => {
    expect(
      extractEvidenceBusinessName({
        ocrText: 'PTH INTERNATIONAL FURNITURE\nDerrimut VIC',
        attachmentAnalysis: {
          ocrText: 'PTH INTERNATIONAL FURNITURE\nDerrimut VIC',
          businessUnderstanding: { identity: { name: 'Mộc' } },
        },
      }),
    ).toMatch(/PTH/i);
  });

  it('BUE used when OCR has no brand line', () => {
    expect(
      extractEvidenceBusinessName({
        ocrText: '',
        attachmentAnalysis: {
          businessUnderstanding: { identity: { name: 'Mộc' } },
        },
      }),
    ).toBe('Mộc');
  });

  it('matching NOODLE hut card → READY_TO_PROPOSE', () => {
    const belief = buildTurnBeliefFromIntake({
      goal: 'Create store: NOODLE hut',
      businessName: 'NOODLE hut',
      ocrText: 'NOODLE hut\nTrading Hours Monday-Thursday 11.30 am\n136 Station Street',
    });
    expect(belief.status).toBe(PERFORMER_STATUS.READY_TO_PROPOSE);
    expect(turnBeliefAllowsDispatch(belief)).toBe(true);
    expect(belief.nonOfferingFacts.some((f) => f.kind === 'OPENING_HOURS')).toBe(true);
  });

  it('generic upload goal does not treat message as business name', () => {
    expect(extractGoalBusinessName('Create store from uploaded card')).toBe('');
  });

  it('stale handoff name ignored when goal is Create store: X and OCR conflicts', () => {
    const belief = buildTurnBeliefFromIntake({
      goal: 'Create store: Coffee House',
      businessName: 'NOODLE hut',
      ocrText: 'AWE FINANCIAL\nLeo Nguyen',
    });
    expect(belief.status).toBe(PERFORMER_STATUS.BLOCKED);
    expect(belief.userVisibleSummary).toMatch(/Coffee House/i);
    expect(belief.userVisibleSummary).toMatch(/AWE/i);
  });

  it('hours-only evidence without conflicting brand stays proposable when goal matches OCR brand', () => {
    const belief = buildTurnBeliefFromIntake({
      businessName: 'NOODLE hut',
      ocrText: 'NOODLE hut Trading Hours Monday-Thursday 11.30 am',
    });
    expect(belief.status).not.toBe(PERFORMER_STATUS.BLOCKED);
  });
});
