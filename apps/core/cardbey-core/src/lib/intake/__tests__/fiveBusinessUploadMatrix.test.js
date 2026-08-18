/**
 * Five-business live-failure matrix — upload create-store identity binding.
 * Success = handoff binds to CURRENT OCR (not stale NOODLE), TurnBelief allows
 * matching cards, and frozen evidence is not reused on create-from-upload without pixels.
 */
import { describe, expect, it } from 'vitest';
import { resolveCreateStoreHandoffFields } from '../../intake/createStoreCheckpointDispatch.js';
import { shouldReuseFrozenEvidenceBundle } from '../../intake/intakeFrozenEvidenceReplay.js';
import {
  buildTurnBeliefFromIntake,
  turnBeliefAllowsDispatch,
  PERFORMER_STATUS,
} from '../../performerTurnBelief/index.js';

const STALE_NOODLE = {
  storeName: 'NOODLE hut',
  location: '136 Station Street, VIC 3078',
};

/** @type {Array<{ id: string, label: string, ocr: string, expectName: RegExp, expectLocationAvoid?: RegExp }>} */
const BUSINESSES = [
  {
    id: 'awe_financial',
    label: 'AWE FINANCIAL (finance broker card)',
    ocr: 'AWE FINANCIAL\nLeo Nguyen\nFinance Broker\n0420 435 238\n238 Barkly St, Footscray VIC',
    expectName: /AWE/i,
    expectLocationAvoid: /136 Station/i,
  },
  {
    id: 'cellarbrations',
    label: 'CELLARBRATIONS DEER PARK (breakfast menu)',
    ocr: 'CELLARBRATIONS DEER PARK\nNEW BREAKFAST MENU\nBig Breakfast $18\nPancakes $14',
    expectName: /CELLARBRATIONS/i,
    expectLocationAvoid: /136 Station/i,
  },
  {
    id: 'coffee_logo',
    label: 'Coffee (logo / creative slogan)',
    ocr: 'Coffee\nYOUR CREATIVE SLOGAN',
    expectName: /Coffee/i,
    expectLocationAvoid: /136 Station/i,
  },
  {
    id: 'pth_construction',
    label: 'PTH Construction (card extraction path)',
    ocr: 'PTH Construction\nMelbourne\nBuilding & Renovation',
    expectName: /PTH/i,
  },
  {
    id: 'noodle_hut_match',
    label: 'NOODLE hut (matching card — proposable)',
    ocr: 'NOODLE hut\nTrading Hours Monday-Thursday 11.30 am\n136 Station Street, Fairfield VIC 3078',
    expectName: /NOODLE/i,
  },
];

describe('Five-business upload create-store matrix', () => {
  for (const biz of BUSINESSES) {
    it(`${biz.id}: handoff binds to ${biz.label} over stale NOODLE params`, () => {
      const fields = resolveCreateStoreHandoffFields({
        userMessage: 'Create store from uploaded card',
        classification: {
          parameters: {
            source: 'upload_ask_selection',
            storeName: STALE_NOODLE.storeName,
            location: STALE_NOODLE.location,
            _autoSubmit: true,
          },
        },
        intentSourceContext: {
          fromAskSelection: 'create_store',
          storeCandidate: { businessName: STALE_NOODLE.storeName, location: STALE_NOODLE.location },
        },
        imageContext: { extractedText: biz.ocr },
      });

      expect(fields.businessName, `${biz.id} businessName`).toMatch(biz.expectName);
      if (biz.expectLocationAvoid) {
        expect(fields.locationTrim ?? '', `${biz.id} location`).not.toMatch(biz.expectLocationAvoid);
      }
    });

    it(`${biz.id}: TurnBelief allows dispatch for matching OCR + goal`, () => {
      const belief = buildTurnBeliefFromIntake({
        goal: `Create store: ${fieldsNameFromOcr(biz.ocr)}`,
        businessName: fieldsNameFromOcr(biz.ocr),
        ocrText: biz.ocr,
      });
      expect(belief.status).not.toBe(PERFORMER_STATUS.BLOCKED);
      expect(turnBeliefAllowsDispatch(belief)).toBe(true);
    });
  }

  it('frozen evidence: create-from-upload without pixels does not reuse stale NOODLE bundle', () => {
    expect(
      shouldReuseFrozenEvidenceBundle({
        bundle: { imageRef: 'data:image/png;base64,noodle-card' },
        currentImageRef: null,
        userMessage: 'Create store from uploaded card',
      }),
    ).toBe(false);
  });

  it('TurnBelief: Coffee OCR vs Create store: NOODLE → BLOCKED (not silent duplicate)', () => {
    const belief = buildTurnBeliefFromIntake({
      goal: 'Create store: NOODLE',
      businessName: 'NOODLE',
      ocrText: 'Coffee\nYOUR CREATIVE SLOGAN',
    });
    expect(belief.status).toBe(PERFORMER_STATUS.BLOCKED);
    expect(turnBeliefAllowsDispatch(belief)).toBe(false);
  });
});

function fieldsNameFromOcr(ocr) {
  return String(ocr).split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
}
