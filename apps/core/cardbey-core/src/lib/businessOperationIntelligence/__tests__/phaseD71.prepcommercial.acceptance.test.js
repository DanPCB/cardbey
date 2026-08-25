/**
 * D7.1 — business context sufficiency + comparison discovery acceptance tests.
 */

import { describe, expect, it } from 'vitest';
import {
  assessBusinessContextSufficiency,
  isGenericBusinessLabel,
  applyTypeClarification,
  understandBusinessContext,
  discoverCompetitorCandidates,
  buildComparisonSearchQueries,
  COMPARISON_CLASS,
  createEmptyBusinessContext,
  projectIdentityFromKnowledge,
  createKnowledgeItem,
  KNOWLEDGE_STATES,
  BUSINESS_CONTEXT_MODES,
  BUSINESS_CONTEXT_STATUS,
} from '../index.js';

describe('D7.1 business context sufficiency', () => {
  it('flags generic Service identity for intended startups', () => {
    expect(isGenericBusinessLabel('Service')).toBe(true);
    const ctx = projectIdentityFromKnowledge(
      createEmptyBusinessContext({
        sourceText: 'I want to create a service business in Melbourne',
        mode: BUSINESS_CONTEXT_MODES.INTENDED,
        knowledge: [
          createKnowledgeItem({
            field: 'name',
            value: 'Service',
            knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
            source: 'nl_parse',
          }),
          createKnowledgeItem({
            field: 'businessType',
            value: 'Service',
            knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
            source: 'nl_parse',
          }),
          createKnowledgeItem({
            field: 'location',
            value: 'Melbourne',
            knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
            source: 'nl_parse',
          }),
        ],
      }),
    );
    const assessment = assessBusinessContextSufficiency(ctx);
    expect(assessment.sufficient).toBe(false);
    expect(assessment.question).toMatch(/service|product/i);
  });

  it('does not clarify when Places-resolved existing business is specific', () => {
    const ctx = projectIdentityFromKnowledge(
      createEmptyBusinessContext({
        sourceText: 'I run BrightPath Tutoring in Geelong',
        mode: BUSINESS_CONTEXT_MODES.EXISTING,
        knowledge: [
          createKnowledgeItem({ field: 'name', value: 'BrightPath Tutoring', knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT, source: 'places' }),
          createKnowledgeItem({ field: 'businessType', value: 'Tutoring', knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE, source: 'classifyBusiness' }),
          createKnowledgeItem({ field: 'location', value: 'Geelong', knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT, source: 'places' }),
          createKnowledgeItem({ field: 'verticalSlug', value: 'education.tutoring', knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE, source: 'classifyBusiness' }),
        ],
        resolution: {
          status: 'matched',
          candidates: [],
          selectedEntityId: 'pl_1',
          requiresSelection: false,
        },
      }),
    );
    expect(assessBusinessContextSufficiency(ctx).sufficient).toBe(true);
  });

  it('applyTypeClarification enriches context and marks USER_DEFINED', async () => {
    let ctx = projectIdentityFromKnowledge(
      createEmptyBusinessContext({
        sourceText: 'I want to create a service business in Melbourne',
        mode: BUSINESS_CONTEXT_MODES.INTENDED,
        status: BUSINESS_CONTEXT_STATUS.AWAITING_TYPE,
        knowledge: [
          createKnowledgeItem({ field: 'name', value: 'Service', knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE, source: 'nl_parse' }),
          createKnowledgeItem({ field: 'businessType', value: 'Service', knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE, source: 'nl_parse' }),
          createKnowledgeItem({ field: 'location', value: 'Melbourne', knowledgeState: KNOWLEDGE_STATES.USER_DEFINED, source: 'user_prompt' }),
          createKnowledgeItem({ field: 'typeClarificationPrompt', value: 'What kind of service?', knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE, source: 'gate' }),
        ],
      }),
    );
    const result = await applyTypeClarification(
      ctx,
      'Mobile bookkeeping and BAS support for small businesses',
      {
        classifyBusiness: async () => ({
          verticalGroup: 'services',
          verticalSlug: 'services.professional',
          confidence: 0.85,
        }),
      },
    );
    expect(result.ok).toBe(true);
    expect(result.nextStep).toBe('confirm');
    expect(result.context.identity.businessType?.toLowerCase()).toMatch(/bookkeeping|bas/);
    const answer = result.context.knowledge.find((k) => k.field === 'typeClarificationAnswer');
    expect(answer?.knowledgeState).toBe(KNOWLEDGE_STATES.USER_DEFINED);
  });
});

describe('D7.1 comparison discovery', () => {
  it('builds context-derived queries for GENERAL verticals', () => {
    const queries = buildComparisonSearchQueries({
      businessName: 'Service',
      businessType: 'Service',
      location: 'Melbourne',
      sourceText: 'Mobile bookkeeping and BAS support for small businesses in Melbourne',
      verticalId: 'GENERAL',
    });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q) => /bookkeeping|bas|accounting/i.test(q))).toBe(true);
  });

  it('shows POSSIBLE_COMPARISON when overlap is weak but defensible', async () => {
    const searchGooglePlaces = async () => [
      {
        name: 'Melbourne BAS Agents',
        location: 'Melbourne',
        placeId: 'p1',
        types: ['accounting', 'bookkeeping'],
        description: 'BAS and bookkeeping for small business',
      },
    ];
    const result = await discoverCompetitorCandidates(
      {
        businessName: 'Mobile Bookkeeping Co',
        businessType: 'Bookkeeping service',
        location: 'Melbourne',
        sourceText: 'Mobile bookkeeping and BAS support for small businesses',
        mode: 'INTENDED',
      },
      { searchGooglePlaces },
    );
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].comparisonClass).not.toBe(COMPARISON_CLASS.REJECTED);
  });

  it('understand triggers clarify_type for generic intended input', async () => {
    const result = await understandBusinessContext(
      { text: 'I want to create a service business in Melbourne', modeHint: 'INTENDED' },
      {
        classifyBusiness: async () => ({ verticalGroup: 'services', verticalSlug: 'services.general', confidence: 0.7 }),
      },
    );
    expect(result.nextStep).toBe('clarify_type');
  });
});
