import { describe, expect, it } from 'vitest';
import { buildUploadGoalOptions, buildUploadAttachmentActionContext } from '../presentOptions.js';

describe('buildUploadGoalOptions attachment stamping', () => {
  it('stamps CREATE_STORE_FROM_UPLOAD attachment refs onto Create store option', () => {
    const belief = {
      sessionId: 'conv_1',
      sessionKey: 'sess_1',
      lastUpload: {
        imageRef: 'data:image/png;base64,abc',
        businessName: 'Pho Ngon',
        evidenceId: 'ev_123',
        attachmentId: 'att_456',
        contentHash: 'hash_789',
        sourceMessageId: 'msg_1',
      },
    };
    const { options } = buildUploadGoalOptions(belief);
    const create = options.find((o) => o.id === 'create_store');
    expect(create.parameters.type).toBe('CREATE_STORE_FROM_UPLOAD');
    expect(create.parameters.source).toBe('upload_ask_selection');
    expect(create.parameters.evidenceId).toBe('ev_123');
    expect(create.parameters.attachmentId).toBe('att_456');
    expect(create.parameters.attachmentIds).toEqual(['att_456', 'ev_123']);
    expect(create.parameters.conversationId).toBe('conv_1');
    expect(create.parameters.storeName).toBe('Pho Ngon');
  });

  it('buildUploadAttachmentActionContext tolerates missing refs', () => {
    const ctx = buildUploadAttachmentActionContext({
      lastUpload: { imageRef: 'data:image/png;base64,x', businessName: null },
    });
    expect(ctx.source).toBe('upload_ask_selection');
    expect(ctx.attachmentIds).toBeUndefined();
  });

  it('uses I see your upload when no businessName', () => {
    const { question, options } = buildUploadGoalOptions({
      lastUpload: { imageRef: 'data:image/png;base64,x', businessName: null },
    });
    expect(question).toMatch(/I see your upload/i);
    expect(options.find((o) => o.id === 'create_store')?.parameters?.storeName).toBeUndefined();
  });

  it('uses I read {name} when lastUpload.businessName set (client OCR projected)', () => {
    const { question, options } = buildUploadGoalOptions({
      lastUpload: {
        imageRef: 'data:image/png;base64,hp',
        businessName: 'HP SERVICES',
      },
    });
    expect(question).toMatch(/I read HP SERVICES/i);
    expect(options.find((o) => o.id === 'create_store')?.parameters?.storeName).toBe('HP SERVICES');
  });
});
