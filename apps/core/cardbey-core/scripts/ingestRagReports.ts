/**
 * Ingest Historical Reports into RAG
 * 
 * Script to ingest all existing TenantReport records into the RAG knowledge base.
 * 
 * Usage:
 *   npm run rag:ingest:reports
 *   npm run rag:ingest:reports -- --tenant=cmigvy38p0000jvx8vq6niqiu
 *   npm run rag:ingest:reports -- --kind=weekly_tenant
 *   npm run rag:ingest:reports -- --since=2025-12-01 --until=2025-12-07
 *   npm run rag:ingest:reports -- --tenant=... --force
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ingestReportIntoRag } from '../src/services/reportRagIngestionService.js';

const prisma = new PrismaClient();

type Args = {
  tenantId?: string;
  kind?: string;
  since?: string;
  until?: string;
  force?: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};

  for (const arg of argv) {
    if (arg.startsWith('--tenant=')) {
      args.tenantId = arg.split('=')[1];
    } else if (arg.startsWith('--kind=')) {
      args.kind = arg.split('=')[1];
    } else if (arg.startsWith('--since=')) {
      args.since = arg.split('=')[1];
    } else if (arg.startsWith('--until=')) {
      args.until = arg.split('=')[1];
    } else if (arg === '--force') {
      args.force = true;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  console.log('[RagIngestReports] Starting historical report ingestion...');
  console.log(`[RagIngestReports] Filters: ${JSON.stringify(args, null, 2)}`);

  // Build Prisma where clause
  const where: any = {};

  if (args.tenantId) {
    where.tenantId = args.tenantId;
  }

  if (args.kind) {
    where.kind = args.kind;
  }

  if (args.since || args.until) {
    where.createdAt = {};
    if (args.since) {
      const sinceDate = new Date(args.since);
      if (isNaN(sinceDate.getTime())) {
        console.error(`[RagIngestReports] Invalid --since date: ${args.since}`);
        process.exit(1);
      }
      where.createdAt.gte = sinceDate;
    }
    if (args.until) {
      const untilDate = new Date(args.until);
      if (isNaN(untilDate.getTime())) {
        console.error(`[RagIngestReports] Invalid --until date: ${args.until}`);
        process.exit(1);
      }
      untilDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = untilDate;
    }
  }

  // Fetch reports
  const reports = await prisma.tenantReport.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  console.log(`[RagIngestReports] Found ${reports.length} report(s) to inspect.`);

  if (reports.length === 0) {
    console.log('[RagIngestReports] No reports found matching the specified filters.');
    await prisma.$disconnect();
    return;
  }

  let chunksCreated = 0;
  let skipped = 0;
  let errors = 0;

  // Process each report
  for (const report of reports) {
    try {
      // Skip reports with empty content
      if (!report.contentMd || report.contentMd.trim().length === 0) {
        console.log(`[RagIngestReports] Skipping report ${report.id} (empty content)`);
        skipped++;
        continue;
      }

      const result = await ingestReportIntoRag(report, { force: args.force });

      if (result.skipped) {
        skipped++;
      } else {
        chunksCreated += result.chunksCreated;
      }
    } catch (err) {
      errors++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[RagIngestReports] Error ingesting report ${report.id}:`,
        errorMessage
      );
    }
  }

  console.log('-----------------------------------------');
  console.log('[RagIngestReports] Completed.');
  console.log(
    `[RagIngestReports] Processed ${reports.length} reports: ${chunksCreated > 0 ? `${chunksCreated} chunks created, ` : ''}${skipped} skipped, ${errors} errors`
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[RagIngestReports] Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});

