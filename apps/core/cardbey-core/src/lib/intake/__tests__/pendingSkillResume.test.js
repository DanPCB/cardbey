// DANH: skill-round6-document
import { describe, expect, it } from 'vitest';
import { reactPlanner } from '../reactPlanner.js';
import {
  PENDING_SKILL_DOCUMENT_INGESTION,
  readPendingSkillContext,
  resumeDocumentIngestionClassification,
} from '../pendingSkillResume.js';

describe('pendingSkillResume', () => {
  it('readPendingSkillContext reads from nested missionContext', () => {
    const ctx = readPendingSkillContext({
      missionContext: {
        pendingSkill: PENDING_SKILL_DOCUMENT_INGESTION,
        pendingInputs: { documentUrl: 'https://cdn.example.com/flyer.jpg' },
      },
    });
    expect(ctx?.pendingSkill).toBe(PENDING_SKILL_DOCUMENT_INGESTION);
    expect(ctx?.pendingInputs.documentUrl).toBe('https://cdn.example.com/flyer.jpg');
  });

  it('resumeDocumentIngestionClassification merges storeId + pending inputs', () => {
    const out = resumeDocumentIngestionClassification(
      { documentBase64: 'abc', mimeType: 'image/png' },
      'store-bakery',
    );
    expect(out.tool).toBe('ingest_document');
    expect(out.parameters.storeId).toBe('store-bakery');
    expect(out.parameters.documentBase64).toBe('abc');
    expect(out._pendingSkillResume).toBe(true);
  });
});

describe('reactPlanner document ingestion store ask', () => {
  it('preserves pendingSkill + pendingInputs when storeId missing', async () => {
    const out = await reactPlanner({
      userMessage: 'Ingest business document https://cdn.example.com/menu.jpg',
      classification: null,
      context: {
        attachments: [{ base64: 'YmFzZTY0', mimeType: 'image/jpeg' }],
      },
      toolRegistry: [],
    });
    expect(out.kind).toBe('ask');
    expect(out.pendingSkill).toBe(PENDING_SKILL_DOCUMENT_INGESTION);
    expect(out.pendingInputs?.documentBase64).toBe('YmFzZTY0');
    expect(out.missionContext?.pendingSkill).toBe(PENDING_SKILL_DOCUMENT_INGESTION);
  });
});
