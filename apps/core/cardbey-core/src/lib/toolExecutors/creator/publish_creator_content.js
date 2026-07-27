/**
 * publish_creator_content — Runtime Authority tool.
 */

import {
  createCreatorContentDraft,
  publishCreatorContentRecord,
} from '../../creator/creatorContentService.js';
import { toCreatorContentErrorPayload } from '../../creator/creatorContentErrors.js';
import { logCreatorContentTelemetry } from '../../creator/creatorContentTelemetry.js';
import { toPublicCreatorContent } from '../../creator/creatorTypes.js';
import { QUALIFICATION_SECONDS } from '../../creator/creatorProgressService.js';
import { getPrismaClient } from '../../prisma.js';

export async function execute(input = {}, context = {}) {
  const userId = context?.userId || input?.userId;
  const contentId = input?.contentId?.trim() || null;
  const action = input?.action || 'publish';

  try {
    const prisma = getPrismaClient();
    let creatorId = input?.creatorId || context?.creatorId || null;

    if (!creatorId && userId) {
      const creator = await prisma.creator.findUnique({
        where: { userId },
        select: { id: true },
      });
      creatorId = creator?.id ?? null;
    }

    if (!creatorId) {
      return {
        status: 'failed',
        error: { code: 'MISSING_CREATOR', message: 'Creator profile required before publishing' },
      };
    }

    let targetContentId = contentId;

    if (!targetContentId) {
      const draft = await createCreatorContentDraft(
        { ...input, creatorId },
        context,
      );
      targetContentId = draft.contentId;

      if (input.publish === false || action === 'draft') {
        logCreatorContentTelemetry('creator_content_draft_created', {
          creatorId,
          contentId: draft.contentId,
          runtimeMissionId: context.missionId ?? null,
          contentType: draft.type,
          assetId: draft.mediaUrl ?? null,
        });
        return {
          status: 'ok',
          output: {
            content: draft,
            missionId: context.missionId ?? null,
          },
        };
      }
    }

    if (action === 'draft') {
      const existing = await prisma.creatorContent.findUnique({ where: { id: targetContentId } });
      return {
        status: 'ok',
        output: {
          content: toPublicCreatorContent(existing),
          missionId: context.missionId ?? null,
        },
      };
    }

    const result = await publishCreatorContentRecord(targetContentId, context);

    return {
      status: 'ok',
      output: {
        content: result.content,
        progress: {
          totalPublishedSeconds: result.progress.totalPublishedSeconds,
          totalPublishedMinutes: result.progress.totalPublishedMinutes,
          qualificationTargetSeconds: QUALIFICATION_SECONDS,
          qualified: result.progress.isQualified,
        },
        alreadyPublished: result.alreadyPublished ?? false,
        missionId: context.missionId ?? null,
      },
    };
  } catch (err) {
    logCreatorContentTelemetry('creator_content_publish_failed', {
      contentId: contentId ?? null,
      runtimeMissionId: context.missionId ?? null,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      status: 'failed',
      error: toCreatorContentErrorPayload(err),
    };
  }
}

export default { execute };
