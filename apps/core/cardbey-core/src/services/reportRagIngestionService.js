/**
 * Report RAG Ingestion Service
 * 
 * Handles indexing TenantReports into the RAG knowledge base.
 * 
 * Scope mappings:
 * - daily_tenant, weekly_tenant, daily_device → tenant_activity
 * - content_studio_activity → content_studio_insights
 * - campaign_performance → campaign_insights
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { chunkText } from './ragChunkUtils.js';

const prisma = new PrismaClient();

// Initialize OpenAI client
if (!process.env.OPENAI_API_KEY) {
  console.warn('[ReportRAG] WARNING: OPENAI_API_KEY not configured. Report RAG ingestion will not work.');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000,
      maxRetries: 2,
    })
  : null;

const HAS_OPENAI = Boolean(openai);

/**
 * Map report kind to RAG scope
 * @param {string} kind - Report kind (e.g., "daily_tenant", "content_studio_activity")
 * @returns {string} RAG scope
 */
function mapReportKindToScope(kind) {
  const scopeMap = {
    // Tenant activity reports
    daily_tenant: 'tenant_activity',
    weekly_tenant: 'tenant_activity',
    daily_device: 'tenant_activity',
    
    // Content studio reports
    content_studio_activity: 'content_studio_insights',
    
    // Campaign reports
    campaign_performance: 'campaign_insights',
    
    // CAI usage reports
    cai_usage: 'tenant_activity',
    
    // Device health reports
    device_health: 'tenant_activity',
    
    // Weekly AI summary
    weekly_ai_summary: 'tenant_activity',
  };
  
  const scope = scopeMap[kind];
  if (!scope) {
    console.warn(`[ReportRAG] Unknown report kind "${kind}", defaulting to tenant_activity`);
    return 'tenant_activity';
  }
  
  return scope;
}

/**
 * Map report to RAG metadata
 * @param {Object} report - TenantReport object
 * @returns {{ scope: string, sourcePath: string }}
 */
export function mapReportToRagMeta(report) {
  const scope = mapReportKindToScope(report.kind);
  const sourcePath = `report/${report.id}`;
  
  return { scope, sourcePath };
}

/**
 * Generate embedding for text using OpenAI
 * @param {string} text - Text to embed
 * @returns {Promise<Buffer>} Embedding as Buffer
 */
async function generateEmbedding(text) {
  if (!HAS_OPENAI) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error('No embedding returned from OpenAI');
    }

    // Convert array to Buffer for storage
    return Buffer.from(new Float32Array(embedding).buffer);
  } catch (error) {
    console.error(`[ReportRAG] Error generating embedding:`, error.message);
    throw error;
  }
}

/**
 * Index a single report into RAG
 * @param {Object} report - TenantReport object
 * @param {Object} options - Options
 * @param {boolean} options.overwrite - If true, delete existing chunks before inserting (default: true)
 * @returns {Promise<{ ok: boolean, chunks: number, error?: string }>}
 */
export async function indexSingleReportToRag(report, { overwrite = true } = {}) {
  if (!HAS_OPENAI) {
    throw new Error('OpenAI API key not configured');
  }

  const { tenantId, contentMd, title, kind } = report;

  if (!contentMd || !tenantId) {
    throw new Error('Report must have contentMd and tenantId');
  }

  const { scope, sourcePath } = mapReportToRagMeta(report);

  console.log(`[ReportRAG] Indexing report ${report.id} (kind=${kind}, scope=${scope})`);

  // Build text to chunk: title as heading + content
  const textToChunk = `# ${title}\n\n${contentMd}`;

  // Chunk the text
  const chunks = chunkText(textToChunk, 500, 80);

  if (chunks.length === 0) {
    console.warn(`[ReportRAG] No chunks generated for report ${report.id}`);
    return { ok: true, chunks: 0 };
  }

  // If overwrite, delete existing chunks for this sourcePath
  if (overwrite) {
    const deleted = await prisma.ragChunk.deleteMany({
      where: {
        sourcePath,
      },
    });
    if (deleted.count > 0) {
      console.log(`[ReportRAG] Deleted ${deleted.count} existing chunks for ${sourcePath}`);
    }
  }

  // Process each chunk
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      // Generate embedding
      const embedding = await generateEmbedding(chunk);

      // Upsert chunk (unique on sourcePath + chunkIndex)
      await prisma.ragChunk.upsert({
        where: {
          sourcePath_chunkIndex: {
            sourcePath,
            chunkIndex: i,
          },
        },
        update: {
          scope,
          content: chunk,
          embedding,
          tenantId,
          updatedAt: new Date(),
        },
        create: {
          scope,
          sourcePath,
          chunkIndex: i,
          content: chunk,
          embedding,
          tenantId,
        },
      });

      successCount++;
    } catch (error) {
      console.error(`[ReportRAG] Error indexing chunk ${i} of report ${report.id}:`, error.message);
      errorCount++;
      // Continue with other chunks
    }
  }

  if (errorCount > 0) {
    console.warn(`[ReportRAG] Indexed ${successCount}/${chunks.length} chunks for report ${report.id} (${errorCount} errors)`);
  } else {
    console.log(`[ReportRAG] ✓ Indexed ${successCount} chunks for report ${report.id}`);
  }

  return {
    ok: errorCount === 0,
    chunks: successCount,
    errors: errorCount > 0 ? errorCount : undefined,
  };
}

/**
 * Ingest a report into RAG with idempotency check
 * 
 * @param {Object} report - TenantReport object
 * @param {Object} options - Options
 * @param {boolean} options.force - If true, re-index even if chunks exist (default: false)
 * @returns {Promise<{ skipped: boolean, chunksCreated: number }>}
 */
export async function ingestReportIntoRag(report, options = {}) {
  const { force = false } = options;
  
  if (!HAS_OPENAI) {
    throw new Error('OpenAI API key not configured');
  }

  const { tenantId, contentMd, kind, periodKey } = report;

  if (!contentMd || !tenantId) {
    throw new Error('Report must have contentMd and tenantId');
  }

  const { sourcePath } = mapReportToRagMeta(report);

  // Idempotency check: see if chunks already exist
  if (!force) {
    const existingChunks = await prisma.ragChunk.findFirst({
      where: {
        sourcePath,
      },
    });

    if (existingChunks) {
      console.log(
        `[RAG Service] Report ${report.id} (${kind}) already indexed; skipping (use --force to reindex)`
      );
      return {
        skipped: true,
        chunksCreated: 0,
      };
    }
  }

  console.log(
    `[RAG Service] Ingesting report ${report.id} (${kind}) for tenant=${tenantId}, period=${periodKey}`
  );

  // Use the existing indexSingleReportToRag function
  const result = await indexSingleReportToRag(report, { overwrite: force });

  if (result.ok) {
    console.log(
      `[RAG Service] Ingested ${result.chunks} chunks from report ${report.id}`
    );
  }

  return {
    skipped: false,
    chunksCreated: result.chunks || 0,
  };
}

/**
 * Batch index reports into RAG
 * @param {Object} options - Filter options
 * @param {string} [options.tenantId] - Filter by tenant ID
 * @param {string[]} [options.kinds] - Filter by report kinds
 * @param {string} [options.from] - Start date (YYYY-MM-DD or ISO string)
 * @param {string} [options.to] - End date (YYYY-MM-DD or ISO string)
 * @param {number} [options.limit] - Maximum number of reports to process
 * @returns {Promise<{ indexed: number, skipped: number, failed: number, errors: Array }>}
 */
export async function indexReportsToRag({ tenantId, kinds, from, to, limit } = {}) {
  if (!HAS_OPENAI) {
    throw new Error('OpenAI API key not configured');
  }

  const where = {};

  if (tenantId) {
    where.tenantId = tenantId;
  }

  if (kinds && kinds.length > 0) {
    where.kind = { in: kinds };
  }

  if (from || to) {
    where.createdAt = {};
    if (from) {
      const fromDate = new Date(from);
      where.createdAt.gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  const reports = await prisma.tenantReport.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  console.log(`[ReportRAG] Found ${reports.length} report(s) to index`);

  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const report of reports) {
    try {
      // Check if report has content
      if (!report.contentMd || report.contentMd.trim().length === 0) {
        console.log(`[ReportRAG] Skipping report ${report.id} (empty content)`);
        skipped++;
        continue;
      }

      const result = await indexSingleReportToRag(report, { overwrite: true });
      
      if (result.ok) {
        indexed++;
      } else {
        failed++;
        errors.push({
          reportId: report.id,
          tenantId: report.tenantId,
          kind: report.kind,
          error: `Failed to index ${result.errors || 0} chunks`,
        });
      }
    } catch (error) {
      failed++;
      const errorMsg = error.message || String(error);
      console.error(`[ReportRAG] ✗ Error indexing report ${report.id}:`, errorMsg);
      errors.push({
        reportId: report.id,
        tenantId: report.tenantId,
        kind: report.kind,
        error: errorMsg,
      });
    }
  }

  console.log(`[ReportRAG] Batch ingestion complete: ${indexed} indexed, ${skipped} skipped, ${failed} failed`);

  return {
    indexed,
    skipped,
    failed,
    errors,
  };
}
