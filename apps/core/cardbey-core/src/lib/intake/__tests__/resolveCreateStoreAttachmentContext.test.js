import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveCreateStoreAttachmentContext,
} from '../resolveCreateStoreAttachmentContext.js';
import {
  stashIntakeWorkflowContext,
  clearIntakeWorkflowContextForTests,
} from '../intakeWorkflowContext.js';

describe('resolveCreateStoreAttachmentContext', () => {
  const sessionKey = 'ca_test_create_store_card';

  beforeEach(() => {
    clearIntakeWorkflowContextForTests();
  });

  it('prefers current message image', () => {
    const ctx = resolveCreateStoreAttachmentContext({
      sessionKey,
      currentImageDataUrl: 'data:image/png;base64,' + 'a'.repeat(80),
      intentSourceContext: {
        cardExtraction: { businessName: 'Acme Co' },
      },
    });
    expect(ctx.attachmentSource).toBe('current_message');
    expect(ctx.cardExtraction?.businessName).toBe('Acme Co');
    expect(ctx.extractionStatus).toBe('ready');
  });

  it('hydrates from session workflow when later text has no attachment', () => {
    stashIntakeWorkflowContext(sessionKey, {
      uploadedAsset: {
        imageDataUrl: 'data:image/png;base64,' + 'b'.repeat(80),
        storeCandidate: { businessName: 'PTH Construction' },
        rawOcrText: 'PTH Construction',
      },
    });
    const ctx = resolveCreateStoreAttachmentContext({
      sessionKey,
      conversationId: sessionKey,
      currentImageDataUrl: null,
      intentSourceContext: {},
    });
    expect(ctx.attachmentSource).toBe('conversation_recent');
    expect(ctx.mediaUrlOrRef).toContain('data:image/png');
    expect(ctx.storeCandidate?.businessName).toBe('PTH Construction');
  });

  it('uses client cardExtraction without pixels as conversation_recent ready', () => {
    const ctx = resolveCreateStoreAttachmentContext({
      sessionKey,
      intentSourceContext: {
        cardExtraction: { businessName: 'Card Name', phone: '0400000000' },
        type: 'CREATE_STORE_FROM_UPLOAD',
      },
    });
    expect(ctx.attachmentSource).toBe('conversation_recent');
    expect(ctx.extractionStatus).toBe('ready');
    expect(ctx.fallbackReason).toBeNull();
  });

  it('returns CARD_ATTACHMENT_NOT_RESOLVED when nothing available', () => {
    const ctx = resolveCreateStoreAttachmentContext({
      sessionKey: 'ca_empty',
      intentSourceContext: {},
    });
    expect(ctx.attachmentSource).toBe('none');
    expect(ctx.fallbackReason).toBe('CARD_ATTACHMENT_NOT_RESOLVED');
  });
});
