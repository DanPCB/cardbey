/**
 * Report RAG Ingestion Script
 * 
 * Batch indexes TenantReports into the RAG knowledge base.
 * 
 * Usage:
 *   node scripts/ingestReportsToRag.js
 *   node scripts/ingestReportsToRag.js --tenant=<tenantId>
 *   node scripts/ingestReportsToRag.js --kind=daily_tenant --kind=weekly_tenant
 *   node scripts/ingestReportsToRag.js --from=2025-01-01 --to=2025-01-31
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { indexReportsToRag } from '../src/services/reportRagIngestionService.js';

const prisma = new PrismaClient();

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tenantId: null,
    kinds: [],
    from: null,
    to: null,
    limit: null,
  };

  for (const arg of args) {
    if (arg.startsWith('--tenant=')) {
      options.tenantId = arg.split('=')[1];
    } else if (arg.startsWith('--kind=')) {
      options.kinds.push(arg.split('=')[1]);
    } else if (arg.startsWith('--from=')) {
      options.from = arg.split('=')[1];
    } else if (arg.startsWith('--to=')) {
      options.to = arg.split('=')[1];
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Report RAG Ingestion Script

Usage:
  node scripts/ingestReportsToRag.js [options]

Options:
  --tenant=<id>          Filter by tenant ID
  --kind=<kind>          Filter by report kind (can be repeated)
  --from=<YYYY-MM-DD>    Start date (inclusive)
  --to=<YYYY-MM-DD>      End date (inclusive)
  --limit=<number>       Maximum number of reports to process
  --help, -h             Show this help message

Examples:
  node scripts/ingestReportsToRag.js
  node scripts/ingestReportsToRag.js --tenant=cmigvy38p0000jvx8vq6niqiu
  node scripts/ingestReportsToRag.js --kind=daily_tenant --kind=weekly_tenant
  node scripts/ingestReportsToRag.js --from=2025-01-01 --to=2025-01-31
      `);
      process.exit(0);
    }
  }

  // Normalize: if kinds array is empty, set to null (no filter)
  if (options.kinds.length === 0) {
    options.kinds = null;
  }

  return options;
}

/**
 * Main function
 */
async function main() {
  console.log('[ReportRAG Ingestion] Starting batch ingestion...\n');

  const options = parseArgs();

  // Log options
  if (options.tenantId) {
    console.log(`[ReportRAG Ingestion] Tenant filter: ${options.tenantId}`);
  }
  if (options.kinds && options.kinds.length > 0) {
    console.log(`[ReportRAG Ingestion] Kind filter: ${options.kinds.join(', ')}`);
  }
  if (options.from) {
    console.log(`[ReportRAG Ingestion] From: ${options.from}`);
  }
  if (options.to) {
    console.log(`[ReportRAG Ingestion] To: ${options.to}`);
  }
  if (options.limit) {
    console.log(`[ReportRAG Ingestion] Limit: ${options.limit}`);
  }
  console.log('');

  try {
    const result = await indexReportsToRag({
      tenantId: options.tenantId || undefined,
      kinds: options.kinds || undefined,
      from: options.from || undefined,
      to: options.to || undefined,
      limit: options.limit || undefined,
    });

    // Print summary
    console.log('\n[ReportRAG Ingestion] Summary:');
    console.log(`  Indexed: ${result.indexed}`);
    console.log(`  Skipped: ${result.skipped}`);
    console.log(`  Failed: ${result.failed}`);

    if (result.errors && result.errors.length > 0) {
      console.log('\n[ReportRAG Ingestion] Errors:');
      result.errors.forEach((err) => {
        console.log(`  - Report ${err.reportId} (${err.kind}): ${err.error}`);
      });
    }

    console.log('\n[ReportRAG Ingestion] Complete!');

    // Exit with error code if any failures
    if (result.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('[ReportRAG Ingestion] Fatal error:', error);
    process.exit(1);
  }
}

// Run main function
main()
  .catch((error) => {
    console.error('[ReportRAG Ingestion] Unhandled error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

