import { describe, it, expect } from 'vitest';
import { validateIntakeAttachmentPayload } from '../intakeAttachmentRef.js';

describe('intakeAttachmentRef', () => {
  it('rejects imageDataUrl plus evidenceId in dev mode', () => {
    const result = validateIntakeAttachmentPayload(
      {
        imageDataUrl: `data:image/png;base64,${'a'.repeat(120)}`,
        evidenceId: 'ev-123',
      },
      { devMode: true },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('duplicate_attachment_payload');
  });

  it('accepts evidence reference only replay payload', () => {
    const result = validateIntakeAttachmentPayload(
      { evidenceId: 'ev-123', userMessage: 'create loyalty from card' },
      { devMode: true },
    );
    expect(result.ok).toBe(true);
  });
});
