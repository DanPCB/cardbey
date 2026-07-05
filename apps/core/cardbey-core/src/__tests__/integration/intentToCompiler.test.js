/**
 * @vitest-environment node
 */
import './coordinatorMock.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntentIntegration, resetIntentIntegrationForTests } from '../../lib/intent/intentIntegration.js';
import {
  classifyAndCompileIfEligible,
  shouldUseMultiAgentCompiler,
} from '../../lib/mission/intentCompilerBridge.js';
import { isRegisteredTool } from '../../lib/intake/intakeToolRegistry.js';
import {
  assertTopologyToolsRegistered,
  createMockIntentIntegrationContext,
  createTestMission,
  setupIntegrationTest,
  teardownIntegrationTest,
} from './setup.js';

describe('integration: IntentReasoner → compileWithMultiAgent', () => {
  /** @type {IntentIntegration} */
  let integration;
  /** @type {{ getContext: ReturnType<typeof vi.fn> }} */
  let mockContextProvider;

  beforeEach(async () => {
    await setupIntegrationTest();
    resetIntentIntegrationForTests();

    const mockContext = createMockIntentIntegrationContext();

    mockContextProvider = {
      getContext: vi.fn().mockResolvedValue(mockContext),
      getOrCreateContext: vi.fn().mockResolvedValue(mockContext),
      updateContext: vi.fn().mockResolvedValue({}),
    };

    integration = new IntentIntegration({
      contextProvider: mockContextProvider,
      logger: console,
      telemetry: { track: vi.fn() },
    });
  });

  afterEach(async () => {
    resetIntentIntegrationForTests();
    await teardownIntegrationTest();
  });

  it('classifies weekend brunch campaign and compiles ArtifactBundle', async () => {
    const mission = await createTestMission();
    const message = 'create a weekend brunch promotion campaign for my store';

    const { classification, compileResult, compiled } = await classifyAndCompileIfEligible(
      integration,
      {
        userId: 'user_integration_test',
        sessionId: 'session_integration_test',
        input: { text: message },
        classifyOpts: {
          userMessage: message,
          currentContext: { activeStoreId: 'store_integration_test' },
        },
        compileContext: {
          missionId: mission.id,
          sessionId: 'session_integration_test',
          storeId: 'store_integration_test',
          intentText: message,
        },
      },
    );

    expect(classification.tool).toBe('create_campaign');
    expect(classification.executionPath).toBe('kernel_dispatch');
    expect(compiled).toBe(true);
    expect(shouldUseMultiAgentCompiler(classification)).toBe(true);
    expect(compileResult?.artifactBundle.topology.nodes.length).toBeGreaterThan(0);
    assertTopologyToolsRegistered(compileResult.artifactBundle.topology);

    for (const node of compileResult.artifactBundle.topology.nodes) {
      expect(isRegisteredTool(node.toolName)).toBe(true);
    }
  });

  it('classifies create_store but does not compile via multi-agent compiler', async () => {
    const mission = await createTestMission({ type: 'create_store' });
    const message = 'create a store called Brunch Cafe';

    const { classification, compileResult, compiled } = await classifyAndCompileIfEligible(
      integration,
      {
        userId: 'user_integration_test',
        sessionId: 'session_integration_test',
        input: { text: message },
        classifyOpts: { userMessage: message },
        compileContext: {
          missionId: mission.id,
          intentText: message,
        },
      },
    );

    expect(classification.tool).toBe('create_store');
    expect(compiled).toBe(false);
    expect(compileResult).toBeNull();
    expect(shouldUseMultiAgentCompiler(classification)).toBe(false);
  });

  it('classifies launch campaign phrasing and compiles ArtifactBundle', async () => {
    const mission = await createTestMission();
    const message = 'launch a campaign for my store';

    const { classification, compileResult, compiled } = await classifyAndCompileIfEligible(
      integration,
      {
        userId: 'user_integration_test',
        sessionId: 'session_integration_test',
        input: { text: message },
        classifyOpts: {
          userMessage: message,
          currentContext: { activeStoreId: 'store_integration_test' },
        },
        compileContext: {
          missionId: mission.id,
          storeId: 'store_integration_test',
          intentText: message,
        },
      },
    );

    expect(classification.tool).toBe('create_campaign');
    expect(compiled).toBe(true);
    expect(compileResult?.validation.ok).toBe(true);
    expect(compileResult?.artifactBundle.reasoning.summary).toMatch(/launch a campaign/i);
  });
});
