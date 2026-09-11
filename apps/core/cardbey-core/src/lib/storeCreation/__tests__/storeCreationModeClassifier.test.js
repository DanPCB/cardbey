/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { classifyStoreCreationMode } from '../storeCreationModeClassifier.js';

describe('classifyStoreCreationMode', () => {
  it('Path A: website → research', () => {
    const r = classifyStoreCreationMode({
      businessName: 'Pho Saigon',
      website: 'https://phosaigon.example.com',
      location: 'Melbourne',
    });
    expect(r.mode).toBe('research');
    expect(r.reason).toBe('has_website');
  });

  it('Path A: phone + location → research', () => {
    const r = classifyStoreCreationMode({
      businessName: 'Pho Saigon',
      phone: '0399998888',
      location: 'Melbourne',
    });
    expect(r.mode).toBe('research');
    expect(r.reason).toBe('has_phone_location');
  });

  it('Path A: OCR evidence → research', () => {
    const r = classifyStoreCreationMode({
      businessName: 'Cafe',
      ocrText: 'A'.repeat(25),
    });
    expect(r.mode).toBe('research');
    expect(r.reason).toBe('has_ocr_evidence');
  });

  it('Path A: researchEligible + email → research', () => {
    const r = classifyStoreCreationMode(
      { businessName: 'Pho Saigon', email: 'hi@example.com', location: 'Melbourne' },
      { researchEligible: true, provisionalConcept: false },
    );
    expect(r.mode).toBe('research');
    expect(r.reason).toBe('intake_research_eligible');
  });

  it('Path B: concept name + category + location → generative', () => {
    const r = classifyStoreCreationMode({
      businessName: 'Vietnamese Coffee Shop',
      businessType: 'cafe',
      location: 'Melbourne',
    });
    expect(r.mode).toBe('generative');
    expect(r.reason).toBe('concept_name_category_location');
  });

  it('Path B: provisionalConcept → generative even if researchEligible', () => {
    const r = classifyStoreCreationMode(
      { businessName: 'Idea', website: '' },
      { researchEligible: true, provisionalConcept: true },
    );
    expect(r.mode).toBe('generative');
    expect(r.reason).toBe('provisional_concept');
  });

  it('Path B: name only → generative', () => {
    const r = classifyStoreCreationMode({ businessName: 'Sunrise Bakery' });
    expect(r.mode).toBe('generative');
    expect(r.reason).toBe('name_only');
  });

  it('handles null intakeAssessment', () => {
    const r = classifyStoreCreationMode({ businessName: 'X', location: 'Melbourne' }, null);
    expect(r.mode).toBe('generative');
  });
});
