/**
 * Phase 4 — IntentReasoner consolidation tests (replaces intakeClassifierConsolidation).
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentReasoner } from '../intentReasoner.js';
import { shouldRouteToAssetIntentDetection } from '../../intake/assetUploadGuard.js';
import { detectDocumentIngestionIntent } from '../documentIngestIntent.js';
import {
  applyDomainCorrection,
  isClassifierToolDispatchable,
  validateClassifierOutput,
} from '../../intake/classifierOutputValidation.js';
import { getDomainForIntent } from '../../intake/intentDomains.js';
import { isLoyaltyIntent, isGraphicDesignIntent } from '../../intake/intentDetectors.js';
import { validateIntakeClassification } from '../../intake/intakeContractValidate.js';

vi.mock('../../llm/llmGateway.ts', () => ({
  llmGateway: {
    generate: vi.fn(async () => {
      throw new Error('LLM should not be called in consolidation tests');
    }),
  },
}));

describe('IntentReasoner consolidation — attachment + graphic policy', () => {
  /** @type {IntentReasoner} */
  let reasoner;
  /** @type {{ getContext: ReturnType<typeof vi.fn> }} */
  let mockContextProvider;
  /** @type {Record<string, unknown>} */
  let mockContext;

  beforeEach(() => {
    mockContext = {
      activeStoreId: 'store-1',
      activeDraftId: null,
      userId: 'user_123',
      sessionId: 'session_123',
      metadata: { updatedAt: new Date().toISOString() },
    };

    mockContextProvider = {
      getContext: vi.fn().mockResolvedValue(mockContext),
    };

    reasoner = new IntentReasoner({
      contextProvider: mockContextProvider,
      config: { minConfidenceThreshold: 0.4, traceEnabled: false, learningEnabled: false },
    });
  });

  it('does not route graphic phrases with attachments to asset intent detection', () => {
    const msg = 'Create a promotion graphic for my spring collection';
    const ctx = {
      attachments: [{ base64: 'Zm9v', mimeType: 'image/jpeg' }],
    };
    expect(shouldRouteToAssetIntentDetection(msg, ctx)).toBe(false);
    expect(detectDocumentIngestionIntent(msg, ctx)).toBeNull();
    expect(isGraphicDesignIntent(msg)).toBe(true);
  });

  it('still routes placeholder-only attachments to asset intent detection', () => {
    const ctx = {
      attachments: [{ base64: 'Zm9v', mimeType: 'image/jpeg' }],
    };
    expect(shouldRouteToAssetIntentDetection('(image attached)', ctx)).toBe(true);
  });

  it('reasoner fast-paths promotion graphic before ingest with attachment', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Create a promotion graphic for my new spring collection dresses',
      attachments: [{ base64: 'Zm9v', mimeType: 'image/jpeg' }],
    });

    expect(result.intent).toBe('generate_graphic');
    expect(result.tool).toBe('create_promotion_graphic');
  });
});

describe('IntentReasoner consolidation — attachment-only must not create_store', () => {
  /** @type {IntentReasoner} */
  let reasoner;
  /** @type {{ getContext: ReturnType<typeof vi.fn> }} */
  let mockContextProvider;

  beforeEach(() => {
    mockContextProvider = {
      getContext: vi.fn().mockResolvedValue({
        activeStoreId: null,
        activeDraftId: null,
        userId: 'user_123',
        sessionId: 'session_123',
        metadata: { updatedAt: new Date().toISOString() },
      }),
    };

    reasoner = new IntentReasoner({
      contextProvider: mockContextProvider,
      config: { minConfidenceThreshold: 0.4, traceEnabled: false, learningEnabled: false },
    });
  });

  const attachment = [{ base64: 'Zm9v', mimeType: 'image/jpeg' }];
  const ocrEnriched =
    "(Image attached)\n\n[Attached image content: Joe's Bakery\n123 Main St\nStart a store with us today!]";

  it('routes to asset intent when OCR-enriched text would imply store creation', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: ocrEnriched,
      originalUserMessage: '(Image attached)',
      attachments: attachment,
    });

    expect(result.tool).toBe('ingest_asset_for_intent_detection');
    const validation = validateIntakeClassification(
      {
        executionPath: 'direct_action',
        tool: result.tool,
        parameters: result.parameters ?? {},
      },
      null,
    );
    expect(validation.ok).toBe(true);
  });

  it('skips store fast-path for attachment-only placeholder uploads', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: ocrEnriched,
      originalUserMessage: '(Image attached)',
      attachments: attachment,
    });

    expect(result.intent).not.toBe('create_store');
    expect(result.tool).not.toBe('create_store');
  });

  it('still fast-paths explicit create store when user typed store intent with attachment', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Create store\n\n[Attached image content: logo data]',
      originalUserMessage: 'Create store',
      attachments: attachment,
    });

    expect(result.intent).toBe('create_store');
    expect(result.tool).toBe('create_store');
  });
});

describe('IntentReasoner consolidation — loyalty fast path', () => {
  /** @type {IntentReasoner} */
  let reasoner;

  beforeEach(() => {
    reasoner = new IntentReasoner({
      contextProvider: {
        getContext: vi.fn().mockResolvedValue({
          activeStoreId: 'store-1',
          userId: 'user_123',
          sessionId: 'session_123',
          metadata: { updatedAt: new Date().toISOString() },
        }),
      },
      config: { minConfidenceThreshold: 0.4, traceEnabled: false, learningEnabled: false },
    });
  });

  it('detects loyalty phrasing', () => {
    expect(isLoyaltyIntent('setup a loyalty program for my store')).toBe(true);
  });

  it('reasoner routes loyalty to setup_loyalty_program', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'setup a loyalty program for my store',
    });

    expect(result.intent).toBe('setup_loyalty');
    expect(result.tool).toBe('setup_loyalty_program');
    expect(result.parameters?.storeId).toBe('store-1');
  });
});

describe('IntentReasoner consolidation — domain taxonomy', () => {
  it('maps graphic phrasing to DESIGN domain', () => {
    expect(getDomainForIntent('create a promotion graphic for dresses')).toBe('DESIGN');
  });

  it('maps loyalty phrasing to LOYALTY domain', () => {
    expect(getDomainForIntent('setup a loyalty program')).toBe('LOYALTY');
  });

  it('corrects ingest_document to create_promotion_graphic in DESIGN domain', () => {
    const corrected = applyDomainCorrection(
      {
        tool: 'ingest_document',
        executionPath: 'direct_action',
        confidence: 0.8,
      },
      'create a promotion graphic for spring dresses',
      'store-1',
    );
    expect(corrected.tool).toBe('create_promotion_graphic');
    expect(corrected._domainCorrected).toBe(true);
  });
});

describe('IntentReasoner consolidation — allowlist gate', () => {
  it('allows setup_loyalty_program on runway', () => {
    expect(isClassifierToolDispatchable('setup_loyalty_program', 'proactive_plan')).toBe(true);
  });

  it('downgrades unknown tools to clarify', () => {
    const out = validateClassifierOutput(
      {
        executionPath: 'proactive_plan',
        tool: 'totally_fake_tool',
        confidence: 0.9,
        parameters: {},
      },
      { userMessage: 'do something weird' },
    );
    expect(out.executionPath).toBe('clarify');
    expect(out.tool).toBe('general_chat');
    expect(out._downgradedReason).toContain('allowlist_reject');
  });
});
