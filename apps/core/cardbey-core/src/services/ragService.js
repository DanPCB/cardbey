/**
 * RAG (Retrieval-Augmented Generation) Service
 * 
 * Provides retrieval and answer generation using knowledge base chunks.
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();

// Initialize OpenAI client
if (!process.env.OPENAI_API_KEY) {
  console.warn('[RAG Service] WARNING: OPENAI_API_KEY not configured. RAG service will not work.');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    })
  : null;

const HAS_OPENAI = Boolean(openai);

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Convert Buffer to Float32Array (embedding vector)
 */
function bufferToFloat32Array(buffer) {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

/**
 * Deterministic pseudo-random generator (mulberry32)
 */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stable string hash (FNV-1a-ish)
 */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text) {
  // In test mode, always return deterministic mock embedding to avoid external API calls
  if (process.env.NODE_ENV === 'test') {
    const seed = hashString(String(text ?? ''));
    const rand = mulberry32(seed);

    // 1536 dims for text-embedding-3-small
    const mockEmbedding = new Array(1536);
    for (let i = 0; i < mockEmbedding.length; i++) {
      mockEmbedding[i] = rand() * 0.1 - 0.05; // [-0.05, 0.05]
    }
    return mockEmbedding;
  }

  // In production, require OpenAI
  if (!HAS_OPENAI) {
    const error = new Error('OpenAI API key not configured');
    error.code = 'OPENAI_NOT_CONFIGURED';
    throw error;
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    const embedding = response?.data?.[0]?.embedding;
    if (!embedding) {
      const err = new Error('No embedding returned from OpenAI');
      err.code = 'OPENAI_EMBEDDING_EMPTY';
      throw err;
    }

    return embedding;
  } catch (error) {
    // Preserve code + attach original error for debugging
    const err = new Error(`Failed to generate embedding: ${error.message}`, { cause: error });
    err.code = error?.code || 'OPENAI_EMBEDDING_FAILED';
    throw err;
  }
}

/**
 * RAG Context Result
 * @typedef {Object} RagContextResult
 * @property {string} [scope] - The scope used (if provided or inferred)
 * @property {Array} chunks - Top chunks with similarity scores
 * @property {string} context - Formatted context string for LLM
 * @property {Array} sources - Sources array for response
 */

/**
 * Build RAG context from a question
 * Extracts retrieval logic for reuse in both streaming and non-streaming endpoints
 * 
 * @param {string} question - The question to ask
 * @param {string} [scope] - Optional scope filter (e.g., "device_engine")
 * @param {string} [tenantId] - Optional tenant ID for tenant-specific filtering
 * @returns {Promise<RagContextResult>} Context result with chunks, context string, and sources
 */
export async function buildRagContext(question, scope, tenantId) {
  // Validate input
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    throw new Error('Question must be a non-empty string');
  }

  // In test mode, allow retrieval to run using deterministic embeddings
  // Only require OpenAI in production
  const isTest = process.env.NODE_ENV === 'test';
  if (!HAS_OPENAI && !isTest) {
    const error = new Error('OpenAI API key not configured');
    error.code = 'OPENAI_NOT_CONFIGURED';
    throw error;
  }

  // Generate embedding for the question
  const questionEmbedding = await generateEmbedding(question);

  // Retrieve candidate chunks
  // For now, we'll load up to 200 chunks and compute similarity in Node
  // This can be optimized later with pgvector
  
  // Determine which scopes to search
  const scopesToSearch = [];
  if (scope) {
    scopesToSearch.push(scope);
  }
  
  // Include report scopes when appropriate
  // Report scopes: tenant_activity, content_studio_insights, campaign_insights
  const questionLower = question.toLowerCase();
  const reportKeywords = ['report', 'weekly', 'daily', 'campaign performance', 'activity report', 'summary'];
  const mentionsReports = reportKeywords.some((keyword) => questionLower.includes(keyword));
  
  // If scope is tenant_activity or mentions reports, include tenant_activity (which contains report chunks)
  if (scope === 'tenant_activity' || scope === 'insights' || mentionsReports) {
    if (!scopesToSearch.includes('tenant_activity')) {
      scopesToSearch.push('tenant_activity');
    }
  }
  
  // If scope is content_studio_insights or mentions content studio, include it
  if (scope === 'content_studio_insights' || questionLower.includes('content studio')) {
    if (!scopesToSearch.includes('content_studio_insights')) {
      scopesToSearch.push('content_studio_insights');
    }
  }
  
  // If scope is campaign_insights or mentions campaigns, include it
  if (scope === 'campaign_insights' || questionLower.includes('campaign')) {
    if (!scopesToSearch.includes('campaign_insights')) {
      scopesToSearch.push('campaign_insights');
    }
  }
  
  // Build where clause
  const whereClause = {};
  
  if (scopesToSearch.length > 0) {
    whereClause.OR = scopesToSearch.map((s) => ({ scope: s }));
  }
  
  // If tenantId is provided, filter by tenantId
  if (tenantId) {
    whereClause.tenantId = tenantId;
  }

  const candidateChunks = await prisma.ragChunk.findMany({
    where: whereClause,
    take: 200, // Limit for performance
    select: {
      id: true,
      scope: true,
      sourcePath: true,
      chunkIndex: true,
      content: true,
      embedding: true,
    },
  });

  if (candidateChunks.length === 0) {
    return {
      scope,
      chunks: [],
      context: '',
      sources: [],
    };
  }

  // Compute similarity scores
  const chunksWithSimilarity = candidateChunks
    .map((chunk) => {
      if (!chunk.embedding) {
        return null;
      }

      try {
        const chunkEmbedding = Array.from(bufferToFloat32Array(chunk.embedding));
        const similarity = cosineSimilarity(questionEmbedding, chunkEmbedding);

        return {
          ...chunk,
          similarity,
        };
      } catch (error) {
        console.warn(`[RAG Service] Error computing similarity for chunk ${chunk.id}:`, error);
        return null;
      }
    })
    .filter((chunk) => chunk !== null)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 8); // Top 8 chunks

  if (chunksWithSimilarity.length === 0) {
    return {
      scope,
      chunks: [],
      context: '',
      sources: [],
    };
  }

  // Build context from top chunks
  const contextParts = chunksWithSimilarity.map(
    (chunk, idx) =>
      `[src:${idx + 1}:${chunk.scope}:${chunk.sourcePath}#${chunk.chunkIndex}]\n${chunk.content}`
  );

  const context = contextParts.join('\n\n---\n\n');

  // Build sources list
  const sources = chunksWithSimilarity.map((chunk) => ({
    id: chunk.id,
    sourcePath: chunk.sourcePath,
    chunkIndex: chunk.chunkIndex,
    snippet: chunk.content.slice(0, 200) + (chunk.content.length > 200 ? '...' : ''),
  }));

  // Determine scope used (if not provided, use the most common scope from sources)
  const scopeUsed = scope || chunksWithSimilarity[0]?.scope;

  return {
    scope: scopeUsed,
    chunks: chunksWithSimilarity,
    context,
    sources,
  };
}

/**
 * Ingest a tenant report into RAG
 * 
 * @param {Object} options
 * @param {Object} options.report - TenantReport object
 * @returns {Promise<void>}
 */
export async function ingestTenantReportToRag({ report }) {
  // In test mode, allow ingestion to run using deterministic embeddings
  // Only require OpenAI in production
  const isTest = process.env.NODE_ENV === 'test';
  if (!HAS_OPENAI && !isTest) {
    const error = new Error('OpenAI API key not configured');
    error.code = 'OPENAI_NOT_CONFIGURED';
    throw error;
  }

  const { tenantId, contentMd, periodKey, kind } = report;

  if (!contentMd || !tenantId) {
    throw new Error('Report must have contentMd and tenantId');
  }

  console.log(`[RAG Service] Ingesting tenant report for ${tenantId}, period ${periodKey}`);

  // Chunk the report content (similar to markdown ingestion)
  const chunkSize = 500;
  const overlap = 80;
  const chunks = [];

  let start = 0;
  while (start < contentMd.length) {
    const end = Math.min(start + chunkSize, contentMd.length);
    const chunk = contentMd.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    const nextStart = end - overlap;
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }

    if (start >= contentMd.length) {
      break;
    }
  }

  if (chunks.length === 0) {
    console.warn(`[RAG Service] No chunks generated for report ${report.id}`);
    return;
  }

  // Use tenant_reports scope and proper sourcePath format
  const sourcePath = `tenant/${tenantId}/report/${report.id}`;
  const reportScope = 'tenant_reports';

  // Process each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      // Generate embedding
      const embedding = await generateEmbedding(chunk);
      const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

      // Build tags including kind and periodKey
      const tags = [report.kind, report.periodKey].filter(Boolean).join(',');

      // Upsert chunk
      await prisma.ragChunk.upsert({
        where: {
          sourcePath_chunkIndex: {
            sourcePath,
            chunkIndex: i,
          },
        },
        update: {
          scope: reportScope,
          content: chunk,
          embedding: embeddingBuffer,
          tenantId,
          updatedAt: new Date(),
        },
        create: {
          scope: reportScope,
          sourcePath,
          chunkIndex: i,
          content: chunk,
          embedding: embeddingBuffer,
          tenantId,
        },
      });
    } catch (error) {
      console.error(`[RAG Service] Error ingesting chunk ${i} of report ${report.id}:`, error);
      // Continue with other chunks
    }
  }

  console.log(`[RAG Service] Ingested ${chunks.length} chunks from report ${report.id}`);
}

/**
 * Upsert one text chunk into RagChunk (embedding computed from content).
 * Used by EFL feedback writer and similar ingest paths.
 *
 * @param {{ scope: string, sourcePath: string, chunkIndex?: number, content: string, tenantId?: string|null }} opts
 */
export async function upsertRagChunkFromText({
  scope,
  sourcePath,
  chunkIndex = 0,
  content,
  tenantId = null,
}) {
  const isTest = process.env.NODE_ENV === 'test';
  if (!HAS_OPENAI && !isTest) {
    const error = new Error('OpenAI API key not configured');
    error.code = 'OPENAI_NOT_CONFIGURED';
    throw error;
  }
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) {
    throw new Error('content must be a non-empty string');
  }

  const embedding = await generateEmbedding(text);
  const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

  await prisma.ragChunk.upsert({
    where: {
      sourcePath_chunkIndex: {
        sourcePath,
        chunkIndex,
      },
    },
    update: {
      scope,
      content: text,
      embedding: embeddingBuffer,
      tenantId,
      updatedAt: new Date(),
    },
    create: {
      scope,
      sourcePath,
      chunkIndex,
      content: text,
      embedding: embeddingBuffer,
      tenantId,
    },
  });
}

/**
 * Get RAG answer for a question (non-streaming)
 * 
 * @param {Object} request - Question and optional filters
 * @param {string} request.question - The question to ask
 * @param {string} [request.scope] - Optional scope filter (e.g., "device_engine")
 * @param {string} [request.tenantId] - Optional tenant ID for tenant-specific filtering
 * @returns {Promise<Object>} Answer with sources
 */
export async function getRagAnswer(request) {
  const { question, scope, tenantId } = request;

  // Build RAG context
  const contextResult = await buildRagContext(question, scope, tenantId);

  if (contextResult.chunks.length === 0) {
    return {
      answer: 'I don\'t have any knowledge base content to answer your question. Please ensure the knowledge base has been ingested.',
      scope: contextResult.scope,
      sources: [],
    };
  }

  // Build prompt for LLM
  const systemPrompt = `You are the Cardbey product assistant. Your role is to help users understand Cardbey features, APIs, and workflows.

IMPORTANT RULES:
1. You must base your answers ONLY on the provided context below.
2. If the context doesn't contain enough information to answer the question, say so clearly and ask for more details.
3. Do not make up information or guess beyond what's in the context.
4. Be concise and helpful.
5. If you reference specific parts of the context, mention the source reference (e.g., "According to [src:1:...]").`;

  const userPrompt = `Context from knowledge base:

${contextResult.context}

---

Question: ${question}

Please provide a helpful answer based on the context above. If the context doesn't contain enough information, say so.`;

  // Call OpenAI chat completion (or return mock in test mode)
  const isTest = process.env.NODE_ENV === 'test';
  let answer;
  if (isTest || !HAS_OPENAI) {
    // In test mode, return a test response
    // In dev/prod without OpenAI, return a clear message
    answer = isTest
      ? 'This is a test response. In production, this would be generated by OpenAI based on the knowledge base.'
      : 'OpenAI is not configured, so I cannot generate an answer.';
  } else {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    answer = completion.choices[0]?.message?.content || 'I apologize, but I couldn\'t generate a response.';
  }

  return {
    answer,
    scope: contextResult.scope,
    sources: contextResult.sources,
  };
}

