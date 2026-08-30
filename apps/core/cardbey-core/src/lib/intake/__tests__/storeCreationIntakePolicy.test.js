import { describe, expect, it } from 'vitest';
import {
  assessStoreCreationIntake,
  buildAmbiguousEntityClarification,
  classifyStoreCreationInputMode,
  isNameOnlyIntakeEligible,
} from '../storeCreationIntakePolicy.js';
import { buildStoreCreationDraft } from '../storeCreationDraft.js';
import { validateStoreCreationFields } from '../intakeErrorTypes.js';

describe('storeCreationIntakePolicy Day 3', () => {
  it('classifies URL-only input', () => {
    expect(classifyStoreCreationInputMode('modernsecuritydoors.com.au', {})).toBe('url');
  });

  it('URL-only draft does not require category/location before research', () => {
    const bundle = buildStoreCreationDraft({
      userMessage: 'modernsecuritydoors.com.au',
      classification: { tool: 'create_store', parameters: {} },
    });
    expect(bundle.draft.website).toContain('modernsecuritydoors.com.au');
    expect(bundle.missingFields).not.toContain('category');
    expect(bundle.missingFields).not.toContain('location');
    expect(bundle.intakeAssessment?.researchEligible).toBe(true);
    expect(bundle.isComplete).toBe(true);
  });

  it('name-only can enter research without location/category', () => {
    const bundle = buildStoreCreationDraft({
      userMessage: 'Market Lane Coffee',
      classification: { tool: 'create_store', parameters: {} },
    });
    expect(bundle.draft.name).toBe('Market Lane Coffee');
    expect(isNameOnlyIntakeEligible(bundle.draft, 'Market Lane Coffee')).toBe(true);
    expect(bundle.missingFields).not.toContain('location');
    expect(bundle.missingFields).not.toContain('category');
    expect(bundle.isComplete).toBe(true);
  });

  it('description-only creates provisional business context', () => {
    const bundle = buildStoreCreationDraft({
      userMessage: 'I run a Vietnamese packaging factory and want customers in Australia.',
      classification: { tool: 'create_store', parameters: {} },
    });
    expect(bundle.draft.name).toBeTruthy();
    expect(bundle.draft.location).toBe('Australia');
    expect(bundle.intakeAssessment?.inputMode).toBe('mixed');
    expect(bundle.isComplete).toBe(true);
  });

  it('name + URL continues without redundant clarification fields', () => {
    const bundle = buildStoreCreationDraft({
      userMessage: 'Create Cardbey for Modern Security Doors https://modernsecuritydoors.com.au',
      classification: { tool: 'create_store', parameters: {} },
    });
    expect(bundle.draft.website).toContain('modernsecuritydoors.com.au');
    expect(bundle.missingFields).toEqual([]);
    expect(bundle.isComplete).toBe(true);
  });

  it('incomplete useful description progresses', () => {
    const bundle = buildStoreCreationDraft({
      userMessage: 'I run a handyman business in Melbourne.',
      classification: { tool: 'create_store', parameters: {} },
    });
    expect(bundle.draft.location).toBe('Melbourne');
    expect(bundle.draft.category).toBe('Home & garden');
    expect(bundle.isComplete).toBe(true);
  });

  it('genuinely insufficient input asks one clarification', () => {
    const bundle = buildStoreCreationDraft({
      userMessage: 'Help me start something.',
      classification: { tool: 'create_store', parameters: {} },
    });
    expect(bundle.intakeAssessment?.clarificationRequired).toBe(true);
    expect(bundle.intakeAssessment?.clarificationReason).toBe('insufficient_input');
    const errors = validateStoreCreationFields({
      userMessage: 'Help me start something.',
      storeName: '',
      location: '',
      category: '',
    });
    expect(errors.some((e) => e.code === 'INSUFFICIENT_INPUT')).toBe(true);
  });

  it('ambiguous entity builds one identity clarification', () => {
    const message = buildAmbiguousEntityClarification([
      { name: 'ABC Plumbing Melbourne' },
      { name: 'ABC Plumbing Sydney' },
    ]);
    expect(message).toContain('multiple businesses');
    expect(message).toContain('ABC Plumbing Melbourne');
  });

  it('assessStoreCreationIntake records telemetry fields', () => {
    const assessment = assessStoreCreationIntake(
      { name: 'Market Lane Coffee', location: null, category: 'Other', website: null },
      'Market Lane Coffee',
    );
    expect(assessment.telemetry.inputMode).toBe('name');
    expect(assessment.telemetry.researchEligible).toBe(true);
    expect(assessment.telemetry.fieldsInferredByResearch).toContain('location');
  });
});
