/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ResearchAgent } from '../agents/researchAgent.js';
import { BuildAgent } from '../agents/buildAgent.js';
import { QAAgent } from '../agents/qaAgent.js';
import { ActionAgent } from '../agents/actionAgent.js';
import * as liveHelpers from '../agents/liveAgentHelpers.js';

const mockStoreKnowledge = {
  name: 'Test Cafe',
  description: 'A neighbourhood cafe in Melbourne',
  category: 'Food & Drink',
  subCategory: 'Cafe',
  suburb: 'Carlton',
  state: 'VIC',
  phone: null,
  email: null,
  website: null,
  socialLinks: {},
  heroImageUrl: null,
  openingHours: 'Mon-Fri 7-3',
  canonicalUrl: 'https://cardbey.com/s/test-cafe',
  enrichmentStatus: 'ENRICHED',
  descriptionProvenance: 'website',
};

const mockResearchOutput = {
  type: 'research',
  marketContext: 'Carlton cafes compete on specialty coffee and brunch.',
  audienceInsight: 'Locals and students seeking weekday coffee.',
  keyMessages: ['Fresh roast', 'Local favourite', 'Weekday brunch'],
  toneRecommendation: 'warm',
  contentAngles: ['morning ritual', 'neighbourhood gem'],
  dataQualityNote: null,
};

const mockBuildOutput = {
  type: 'copy',
  headline: 'Summer sips at Test Cafe',
  subheadline: 'Cool down with iced favourites',
  bodyText: 'Escape the heat with specialty iced coffee and seasonal brunch plates.',
  callToAction: 'Visit today',
  alternateHeadlines: ['Iced season is on', 'Cooler mornings start here'],
  outputType: 'promotion',
  graphicBrief: null,
  content: 'Summer sips at Test Cafe',
  summary: 'Summer sips at Test Cafe',
};

function mockBlackboard() {
  const events = [];
  return {
    appendEvent: vi.fn(async (missionId, eventType, payload) => {
      events.push({ missionId, eventType, payload });
      return {};
    }),
    getEvents: vi.fn(async () => ({ events })),
    _events: events,
  };
}

describe('Live specialist agents (mocked LLM)', () => {
  beforeEach(() => {
    vi.spyOn(liveHelpers, 'callAgentJson').mockImplementation(async ({ agentName }) => {
      if (agentName === 'ResearchAgent') return mockResearchOutput;
      if (agentName === 'BuildAgent') return mockBuildOutput;
      if (agentName === 'QAAgent') return { aligned: true, reason: 'matches brief' };
      return {};
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ResearchAgent returns structured ResearchOutput', async () => {
    const blackboard = mockBlackboard();
    const agent = new ResearchAgent({
      context: {
        missionId: 'm-research',
        storeId: 'store-1',
        storeKnowledge: mockStoreKnowledge,
        blackboard,
      },
    });
    const result = await agent.execute({
      taskId: 't1',
      agentType: 'research',
      goal: 'Create a summer promotion',
    });
    expect(result.result.marketContext).toBeTruthy();
    expect(result.result.keyMessages).toBeInstanceOf(Array);
    expect(result.result.toneRecommendation).toMatch(/warm|professional|playful|urgent|community/i);
    expect(blackboard.appendEvent).toHaveBeenCalledWith(
      'm-research',
      'research:complete',
      expect.any(Object),
    );
  });

  it('ResearchAgent handles null storeKnowledge gracefully', async () => {
    vi.spyOn(liveHelpers, 'callAgentJson').mockResolvedValue({
      ...mockResearchOutput,
      dataQualityNote: 'No store context',
    });
    const agent = new ResearchAgent({
      context: {
        missionId: 'm-research-null',
        storeKnowledge: null,
        blackboard: mockBlackboard(),
      },
    });
    const result = await agent.execute({
      taskId: 't1',
      agentType: 'research',
      goal: 'Create a promotion',
    });
    expect(result.result).toBeTruthy();
    expect(result.result.dataQualityNote).toBeTruthy();
  });

  it('BuildAgent produces BuildOutput from research priorWork', async () => {
    const blackboard = mockBlackboard();
    const agent = new BuildAgent({
      context: {
        missionId: 'm-build',
        storeKnowledge: mockStoreKnowledge,
        blackboard,
      },
    });
    const result = await agent.execute({
      taskId: 't2',
      agentType: 'build',
      goal: 'Create a summer promotion',
      priorWork: [{ agentType: 'research', result: mockResearchOutput }],
    });
    expect(result.result.headline).toBeTruthy();
    expect(result.result.bodyText).toBeTruthy();
    expect(result.result.callToAction).toBeTruthy();
  });

  it('QAAgent passes valid build output', async () => {
    const agent = new QAAgent({
      context: {
        missionId: 'm-qa',
        storeKnowledge: mockStoreKnowledge,
        blackboard: mockBlackboard(),
      },
    });
    const result = await agent.execute({
      taskId: 't3',
      agentType: 'qa',
      goal: 'Create a summer promotion',
      priorWork: [{ agentType: 'build', result: mockBuildOutput }],
    });
    expect(result.result.score).toBeGreaterThan(50);
    expect(result.result.approvedForAction).toBe(true);
  });

  it('QAAgent fails build output with no headline', async () => {
    const agent = new QAAgent({
      context: {
        missionId: 'm-qa-fail',
        storeKnowledge: mockStoreKnowledge,
        blackboard: mockBlackboard(),
      },
    });
    const result = await agent.execute({
      taskId: 't3',
      agentType: 'qa',
      goal: 'Create a summer promotion',
      priorWork: [{ agentType: 'build', result: { ...mockBuildOutput, headline: '' } }],
    });
    expect(result.result.passed).toBe(false);
    expect(result.result.issues.length).toBeGreaterThan(0);
  });

  it('ActionAgent creates copy artifact when QA approves', async () => {
    const blackboard = mockBlackboard();
    const agent = new ActionAgent({
      context: {
        missionId: 'm-action',
        storeId: 'store-1',
        storeKnowledge: mockStoreKnowledge,
        blackboard,
      },
    });
    const result = await agent.execute({
      taskId: 't4',
      agentType: 'action',
      goal: 'Create a summer promotion',
      priorWork: [
        { agentType: 'build', result: mockBuildOutput },
        {
          agentType: 'qa',
          result: {
            type: 'qa',
            passed: true,
            score: 90,
            issues: [],
            suggestions: [],
            approvedForAction: true,
          },
        },
      ],
    });
    expect(result.result.actionsPerformed.length).toBeGreaterThan(0);
    expect(result.result.artifactIds.length).toBeGreaterThan(0);
    expect(blackboard.appendEvent).toHaveBeenCalledWith(
      'm-action',
      'artifact:created',
      expect.objectContaining({ artifactType: 'copy' }),
    );
  });
});
