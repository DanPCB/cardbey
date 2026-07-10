import { getPrismaClient } from '../src/lib/prisma.js';
import { readMetadata } from '../src/lib/persistence/metadataWriter.js';
import { executeApprovedTopology } from '../src/lib/mission/topologyExecutor.js';

const missionId = process.argv[2];
if (!missionId) {
  console.error('Usage: node scripts/debug-run-topology.mjs <missionId>');
  process.exit(1);
}

const meta = await readMetadata(missionId);
const topology = meta?.approvedTopology ?? meta?.pendingTopology;
console.log('has topology', Boolean(topology), 'nodes', topology?.nodes?.length);

try {
  const result = await executeApprovedTopology(missionId, topology, {
    userId: 'cmqn6kpdf000gjvo07i7urxcy',
    storeId: meta?.storeId ?? meta?.executionContext?.storeId ?? undefined,
  });
  console.log(
    JSON.stringify(
      {
        status: result.status,
        multiAgentStatus: result.multiAgentStatus,
        nodeRunStatus: result.nodeRun?.status,
        nodeStatus: result.nodeRun?.nodeStatus,
        failedNodeIds: result.nodeRun?.failedNodeIds,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error('EXEC ERROR', e?.message);
  console.error(e?.stack);
}

const prisma = getPrismaClient();
await prisma.$disconnect();
