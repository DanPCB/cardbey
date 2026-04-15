/**
 * Normalize Draft Response
 * Converts a DraftStore record into a contract-compliant API response
 */

import type { PrismaClient } from '@prisma/client';

export async function normalizeDraftResponse(
  draft: any,
  storeId: string,
  prisma: PrismaClient,
  generationRunId?: string | null
): Promise<any> {
  // Parse draft data
  const input = typeof draft.input === 'string' ? JSON.parse(draft.input) : (draft.input || {});
  const preview = typeof draft.preview === 'string' ? JSON.parse(draft.preview) : (draft.preview || {});
  
  // Return normalized response structure
  return {
    ok: true,
    draft: {
      id: draft.id,
      storeId: storeId,
      status: draft.status,
      input,
      preview,
      generationRunId: input?.generationRunId || generationRunId || null,
      createdAt: draft.createdAt?.toISOString() || draft.createdAt,
      updatedAt: draft.updatedAt?.toISOString() || draft.updatedAt,
    },
  };
}

