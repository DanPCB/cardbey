// DANH: skill-runtime-phase2
/**
 * SkillContextBuilder — turns the intake payload available at the
 * `skillRouter.route()` call site into a `SkillContext` the runtime understands.
 *
 * Adaptation notes (vs. the Phase 2 task sketch):
 *  - The real `SkillContext` (types.ts) has NO top-level `skillId`, `storeId`,
 *    `sessionId`, or `businessCategory` fields. Per "do not invent fields",
 *    those extras are stashed in `metadata`. The first-class fields are
 *    `query`, `userId`, `conversationId`, `userHasProducts`, `existingSegments`,
 *    `metadata`.
 *  - The `Business` model has no `category` column (confirmed in
 *    prisma/postgres/schema.prisma); it has `type`. Enrichment selects `type`
 *    and maps it to `metadata.businessCategory`.
 *  - Prisma is injected (no global import) so the builder is unit-testable and
 *    does not couple the runtime to a specific client instance.
 */

import { createLogger } from '../logger.js';
import type { SkillContext } from './types.js';

const log = createLogger('SkillContextBuilder');

/**
 * Loose shape of the intake payload at the dispatcher call site. All fields are
 * optional because different surfaces populate different subsets.
 */
export interface IntakePayload {
  intentLabel?: string | null;
  userMessage?: string | null;
  storeId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  conversationId?: string | null;
  missionId?: string | null;
  metadata?: Record<string, any> | null;
}

/** Minimal Prisma surface this builder needs (keeps tests light). */
export interface PrismaLike {
  business: {
    findUnique: (args: any) => Promise<any>;
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export async function buildSkillContext(
  intakePayload: IntakePayload,
  prisma: PrismaLike
): Promise<SkillContext> {
  const payload = intakePayload ?? {};

  // DANH: skill-runtime-phase7 — natural language drives pattern matching when both are present
  const query = str(payload.userMessage) || str(payload.intentLabel);
  const userId = str(payload.userId);
  const conversationId =
    str(payload.sessionId) || str(payload.conversationId) || str(payload.missionId);
  const storeId = str(payload.storeId) || null;

  let userHasProducts = false;
  const existingSegments: string[] = [];
  let businessCategory: string | null = null;

  // Optional enrichment — only when a store is known, only fields the
  // IntentPattern matchers actually use. Best-effort: never fatal.
  if (storeId && prisma?.business?.findUnique) {
    try {
      const biz = await prisma.business.findUnique({
        where: { id: storeId },
        select: {
          type: true, // Business has `type`, not `category`
          _count: { select: { products: true } },
        },
      });
      if (biz) {
        userHasProducts = (biz._count?.products ?? 0) > 0;
        businessCategory = biz.type ?? null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('enrichment failed (non-fatal)', { storeId, error: message });
    }
  }

  return {
    query,
    userId,
    conversationId,
    userHasProducts,
    existingSegments,
    metadata: {
      ...(payload.metadata ?? {}),
      storeId,
      sessionId: str(payload.sessionId) || null,
      missionId: str(payload.missionId) || null,
      businessCategory,
      source: 'performer_intake_v2',
    },
  };
}
