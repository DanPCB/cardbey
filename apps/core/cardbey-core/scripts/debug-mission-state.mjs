import { getPrismaClient } from '../src/lib/prisma.js';

const missionId = process.argv[2];
if (!missionId) {
  console.error('Usage: node scripts/debug-mission-state.mjs <missionId>');
  process.exit(1);
}

const prisma = getPrismaClient();
const p = await prisma.missionPipeline.findUnique({
  where: { id: missionId },
  select: {
    id: true,
    status: true,
    runState: true,
    type: true,
    targetId: true,
    metadataJson: true,
    outputsJson: true,
    progressCompletedSteps: true,
    progressTotalSteps: true,
    updatedAt: true,
  },
});

if (!p) {
  console.log('Mission not found');
  process.exit(0);
}

const meta =
  p.metadataJson && typeof p.metadataJson === 'object' && !Array.isArray(p.metadataJson)
    ? p.metadataJson
    : {};
const nodes = meta.approvedTopology?.nodes ?? meta.pendingTopology?.nodes ?? [];

console.log(
  JSON.stringify(
    {
      status: p.status,
      runState: p.runState,
      type: p.type,
      targetId: p.targetId,
      updatedAt: p.updatedAt,
      progress: [p.progressCompletedSteps, p.progressTotalSteps],
      multiAgentStatus: meta.multiAgentStatus,
      approvalStatus: meta.approvalStatus,
      executionState: meta.executionState,
      runtimeState: meta.runtimeState,
      topologyNodeStatus: meta.topologyNodeStatus,
      executionFailureReason: meta.executionFailureReason,
      executionFailureMessage: meta.executionFailureMessage,
      pendingTopology: Boolean(meta.pendingTopology),
      approvedTopology: Boolean(meta.approvedTopology),
      nodeCount: nodes.length,
      nodes: nodes.map((n) => ({
        id: n.id,
        tool: n.toolName,
        stage: n.config?.stage,
        status: meta.topologyNodeStatus?.[n.id],
      })),
    },
    null,
    2,
  ),
);

const task = await prisma.orchestratorTask.findFirst({
  where: { missionId },
  orderBy: { updatedAt: 'desc' },
});
let events = [];
try {
  events = await prisma.missionBlackboardEvent.findMany({
    where: { missionId },
    orderBy: { seq: 'asc' },
    take: 30,
    select: { seq: true, type: true, payloadJson: true },
  });
} catch (err) {
  console.log('blackboard query failed', err?.message);
}

console.log(
  JSON.stringify(
    {
      orchestratorTask: task
        ? { id: task.id, status: task.status, updatedAt: task.updatedAt }
        : null,
      blackboardEvents: events.map((e) => ({
        seq: e.seq,
        type: e.type,
        payload:
          typeof e.payloadJson === 'object'
            ? JSON.stringify(e.payloadJson).slice(0, 160)
            : e.payloadJson,
      })),
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
