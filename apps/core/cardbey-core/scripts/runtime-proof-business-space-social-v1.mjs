/**
 * Local runtime proof — Business Space Social V1 (post + comment) via Prisma services.
 * Not a substitute for browser E2E; proves persistence + count + auth fail-closed.
 *
 *   node scripts/runtime-proof-business-space-social-v1.mjs
 */
import { PrismaClient } from '@prisma/client';
import { publishSpaceUpdate } from '../src/lib/spacePosts/publishSpaceUpdate.js';
import {
  createActivityComment,
  listActivityComments,
  publicLifecycleContentKey,
} from '../src/services/activityCommentService.js';

const prisma = new PrismaClient();
const stamp = Date.now();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const owner = await prisma.user.create({
    data: {
      email: `social-v1-owner-${stamp}@example.com`,
      passwordHash: 'x',
      displayName: 'Social Owner',
    },
  });
  const stranger = await prisma.user.create({
    data: {
      email: `social-v1-stranger-${stamp}@example.com`,
      passwordHash: 'x',
      displayName: 'Social Stranger',
    },
  });
  const store = await prisma.business.create({
    data: {
      name: 'Social V1 Proof Store',
      slug: `social-v1-${stamp}`,
      userId: owner.id,
      type: 'retail',
    },
  });

  // --- POST (authorized) ---
  const published = await publishSpaceUpdate(prisma, {
    storeId: store.id,
    userId: owner.id,
    user: owner,
    text: 'Business Space activation test',
    distribution: 'GLOBAL_ELIGIBLE',
    attachToShows: false,
  });
  assert(published.ok, `publish failed: ${published.error}`);
  const activityId = published.event?.id;
  assert(activityId, 'missing event id');
  const persisted = await prisma.storeActivityEvent.findUnique({ where: { id: activityId } });
  assert(persisted?.eventType === 'SPACE_UPDATE', 'event type mismatch');
  assert(persisted?.source === 'public_lifecycle', 'event source mismatch');

  // --- POST (unauthorized) ---
  const denied = await publishSpaceUpdate(prisma, {
    storeId: store.id,
    userId: stranger.id,
    user: stranger,
    text: 'should not persist',
    distribution: 'GLOBAL_ELIGIBLE',
  });
  assert(!denied.ok, 'unauthorized publish should fail');
  assert(denied.status === 403 || denied.status === 401, `expected 401/403 got ${denied.status}`);
  const rogue = await prisma.storeActivityEvent.count({
    where: { storeId: store.id, metadataJson: { path: ['text'], equals: 'should not persist' } },
  }).catch(() => 0);
  // metadata filter may not work on sqlite json path — count SPACE_UPDATE for store after denied
  const eventCount = await prisma.storeActivityEvent.count({
    where: { storeId: store.id, eventType: 'SPACE_UPDATE' },
  });
  assert(eventCount === 1, `expected 1 SPACE_UPDATE, got ${eventCount}`);

  // --- COMMENT ---
  const key = publicLifecycleContentKey(activityId);
  const commenter = await createActivityComment(prisma, {
    contentType: key.contentType,
    contentId: key.contentId,
    text: 'Canonical comment test',
    actorUserId: stranger.id,
    storeId: store.id,
  });
  assert(commenter.ok, `comment failed: ${commenter.error}`);
  assert(commenter.total === 1, 'commentsCount should be 1');

  const listed = await listActivityComments(prisma, {
    contentType: key.contentType,
    contentId: key.contentId,
  });
  assert(listed.ok && listed.comments.length === 1, 'list should return comment');
  assert(listed.comments[0].text === 'Canonical comment test', 'text mismatch');

  const metrics = await prisma.contentInteractionMetrics.findUnique({
    where: {
      contentType_contentId: {
        contentType: key.contentType,
        contentId: key.contentId,
      },
    },
  });
  assert(metrics?.commentsCount === 1, 'metrics commentsCount should be 1');

  // --- empty / missing activity ---
  const empty = await createActivityComment(prisma, {
    contentType: key.contentType,
    contentId: key.contentId,
    text: '  ',
    actorUserId: stranger.id,
  });
  assert(!empty.ok && empty.error === 'empty_comment', 'empty should fail');

  const missing = await createActivityComment(prisma, {
    contentType: 'feed_artifact',
    contentId: 'public_lifecycle:missing-id',
    text: 'nope',
    actorUserId: stranger.id,
  });
  assert(!missing.ok && missing.status === 404, 'missing activity should 404');

  console.log(
    JSON.stringify(
      {
        ok: true,
        storeId: store.id,
        activityId,
        commentId: commenter.comment.id,
        commentsCount: metrics.commentsCount,
        globalRankBumped: published.globalRankBumped,
        unauthorizedPublishStatus: denied.status,
      },
      null,
      2,
    ),
  );

  // cleanup
  await prisma.comment.deleteMany({ where: { contentId: key.contentId } });
  await prisma.contentInteractionMetrics.deleteMany({
    where: { contentId: key.contentId },
  });
  await prisma.storeActivityEvent.deleteMany({ where: { storeId: store.id } });
  await prisma.business.delete({ where: { id: store.id } });
  await prisma.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } });
}

main()
  .catch((e) => {
    console.error('RUNTIME_PROOF_FAIL', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
