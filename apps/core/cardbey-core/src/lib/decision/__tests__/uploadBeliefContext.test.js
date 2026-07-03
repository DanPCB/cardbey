import { describe, expect, it } from 'vitest';
import {
  activeGoalSupersedesUploadClarify,
  isUploadPendingConfirmationWorkflow,
} from '../uploadBeliefContext.js';

describe('uploadBeliefContext', () => {
  it('treats upload_intake pending_confirmation as upload workflow', () => {
    expect(
      isUploadPendingConfirmationWorkflow({
        type: 'upload_intake',
        status: 'pending_confirmation',
      }),
    ).toBe(true);
  });

  it('treats store_creation from uploaded_asset as upload workflow', () => {
    expect(
      isUploadPendingConfirmationWorkflow(
        {
          type: 'store_creation',
          status: 'pending_confirmation',
          source: 'uploaded_asset',
        },
        { uploadedAsset: { imageDataUrl: 'data:image/png;base64,x' } },
      ),
    ).toBe(true);
  });

  it('does not treat bare pending_confirmation as upload workflow', () => {
    expect(
      isUploadPendingConfirmationWorkflow({
        status: 'pending_confirmation',
      }),
    ).toBe(false);
  });

  it('active campaign goal supersedes stale upload clarify', () => {
    expect(activeGoalSupersedesUploadClarify({ intent: 'create_campaign' })).toBe(true);
    expect(activeGoalSupersedesUploadClarify({ intent: 'create_store_from_upload' })).toBe(false);
  });
});
