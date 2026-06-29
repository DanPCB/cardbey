import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { runIntakeAuthorityTurn } from '../intakeV2AuthorityTurn.js';

describe('runIntakeAuthorityTurn', () => {
  const prevAuthority = process.env.INTAKE_DECISION_LOOP_AUTHORITY;

  beforeEach(() => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'true';
  });

  afterEach(() => {
    if (prevAuthority === undefined) delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    else process.env.INTAKE_DECISION_LOOP_AUTHORITY = prevAuthority;
  });

  it('returns upload ask panel for attachment-only turn (authority short-circuit)', async () => {
    const out = await runIntakeAuthorityTurn({
      attachmentOnlyUpload: true,
      hasAttachment: true,
      imageDataUrl: 'data:image/png;base64,abc',
      intentSourceContext: { uploadedAssetPending: true },
      advisorInput: {
        userMessage: '(Image attached)',
        originalUserMessage: '(Image attached)',
        hasAttachment: true,
        imageDataUrl: 'data:image/png;base64,abc',
        intentSourceContext: { uploadedAssetPending: true },
      },
      beliefLoaderOpts: {
        sessionKey: 'sess-upload',
        intentSourceContext: { uploadedAssetPending: true },
        body: {
          attachments: [{ type: 'image', uri: 'data:image/png;base64,abc', dataUrl: 'data:image/png;base64,abc' }],
        },
      },
    });

    expect(out.handled).toBe(true);
    expect(out.httpPayload?.response).toMatch(/upload/i);
    expect(out.httpPayload?.options?.some((o) => o.label === 'Create store')).toBe(true);
    expect(out.httpPayload?.response).not.toMatch(/Could you clarify what you would like to do/i);
  });

  it('defers when forcedTool is set (chip selection)', async () => {
    const out = await runIntakeAuthorityTurn({
      forcedTool: 'create_store',
      attachmentOnlyUpload: false,
      hasAttachment: true,
      imageDataUrl: 'data:image/png;base64,abc',
    });
    expect(out.handled).toBe(false);
  });
});
