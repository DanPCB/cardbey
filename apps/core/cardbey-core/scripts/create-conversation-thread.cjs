/**
 * Optional dev helper: create a ConversationThread + participants quickly.
 * Usage: node scripts/create-conversation-thread.cjs [userId] [tenantId]
 * If userId/tenantId omitted, uses first User id and their id as tenant.
 */

const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../node_modules/.prisma/client-gen'));

const prisma = new PrismaClient();

async function main() {
  const userId = process.argv[2];
  const tenantId = process.argv[3];

  let uid = userId;
  let tid = tenantId;

  if (!uid) {
    const user = await prisma.user.findFirst({ select: { id: true } });
    if (!user) {
      console.error('No user in DB. Create a user first.');
      process.exit(1);
    }
    uid = user.id;
    tid = tid || uid;
  } else {
    tid = tid || uid;
  }

  const task = await prisma.orchestratorTask.create({
    data: {
      entryPoint: 'agent-chat',
      tenantId: tid,
      userId: uid,
      status: 'queued',
      request: { source: 'script-create-thread' },
    },
  });

  const thread = await prisma.conversationThread.create({
    data: {
      tenantId: tid,
      title: 'Dev thread',
      missionId: task.id,
      createdByUserId: uid,
      status: 'active',
    },
  });

  await prisma.threadParticipant.createMany({
    data: [
      { threadId: thread.id, participantType: 'user', participantId: uid, role: 'owner' },
      { threadId: thread.id, participantType: 'agent', participantId: 'planner', role: 'member' },
      { threadId: thread.id, participantType: 'agent', participantId: 'research', role: 'member' },
    ],
  });

  console.log('Created thread:', thread.id, 'missionId:', task.id);
  console.log('Open in dashboard: /app/back/threads/' + thread.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
