/**
 * RAG Knowledge Base Ingestion Script
 * 
 * Reads markdown files from knowledge-base/** and ingests them into the RAG system.
 * 
 * Usage: npm run rag:ingest
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get repo root (go up from scripts/ to root)
const REPO_ROOT = path.resolve(__dirname, '..');
const KNOWLEDGE_BASE_DIR = path.join(REPO_ROOT, 'knowledge-base');

const prisma = new PrismaClient();

// Initialize OpenAI client
if (!process.env.OPENAI_API_KEY) {
  console.error('[RAG Ingestion] ERROR: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000, // 60 second timeout for embeddings
  maxRetries: 2,
});

/**
 * Chunk text into overlapping chunks
 * @param text - Text to chunk
 * @param chunkSize - Target chunk size in characters
 * @param overlap - Overlap size in characters
 * @returns Array of chunk strings
 */
function chunkText(text: string, chunkSize: number = 500, overlap: number = 80): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Move start position forward, accounting for overlap
    const nextStart = end - overlap;
    
    // Prevent infinite loop - ensure we always make progress
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }
    
    // Safety check: if we've processed all text, break
    if (start >= text.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text: string): Promise<Buffer> {
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
  } catch (error: any) {
    console.error(`[RAG Ingestion] Error generating embedding:`, error.message);
    throw error;
  }
}

/**
 * Derive scope from directory path
 * knowledge-base/device-engine/file.md -> "device_engine"
 */
function deriveScope(filePath: string): string {
  const relativePath = path.relative(KNOWLEDGE_BASE_DIR, filePath);
  const parts = relativePath.split(path.sep);
  
  if (parts.length === 0) {
    return 'general';
  }
  
  // First directory after knowledge-base is the scope
  const scopeDir = parts[0];
  // Convert kebab-case to snake_case
  return scopeDir.replace(/-/g, '_');
}

/**
 * Process a single markdown file
 */
async function processFile(filePath: string): Promise<{ chunks: number; scope: string }> {
  const content = await fs.readFile(filePath, 'utf-8');
  const scope = deriveScope(filePath);
  const relativePath = path.relative(REPO_ROOT, filePath);
  
  // Chunk the content
  const chunks = chunkText(content, 500, 80);
  
  console.log(`[RAG Ingestion] Processing ${relativePath} (${chunks.length} chunks, scope: ${scope})`);
  
  // Process each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Generate embedding
    const embedding = await generateEmbedding(chunk);
    
    // Upsert chunk (unique on sourcePath + chunkIndex)
    await prisma.ragChunk.upsert({
      where: {
        sourcePath_chunkIndex: {
          sourcePath: relativePath,
          chunkIndex: i,
        },
      },
      update: {
        scope,
        content: chunk,
        embedding,
        updatedAt: new Date(),
      },
      create: {
        scope,
        sourcePath: relativePath,
        chunkIndex: i,
        content: chunk,
        embedding,
      },
    });
  }
  
  return { chunks: chunks.length, scope };
}

/**
 * Find all markdown files in knowledge-base directory
 */
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively search subdirectories
        const subFiles = await findMarkdownFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
        files.push(fullPath);
      }
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error(`[RAG Ingestion] Error reading directory ${dir}:`, error.message);
    }
  }
  
  return files;
}

/**
 * Main ingestion function
 */
async function ingest() {
  console.log('[RAG Ingestion] Starting knowledge base ingestion...');
  console.log(`[RAG Ingestion] Knowledge base directory: ${KNOWLEDGE_BASE_DIR}`);
  
  // Check if knowledge-base directory exists
  try {
    await fs.access(KNOWLEDGE_BASE_DIR);
  } catch {
    console.warn(`[RAG Ingestion] WARNING: Knowledge base directory not found: ${KNOWLEDGE_BASE_DIR}`);
    console.warn('[RAG Ingestion] Creating empty directory. Add markdown files to knowledge-base/** to ingest them.');
    await fs.mkdir(KNOWLEDGE_BASE_DIR, { recursive: true });
    return;
  }
  
  // Find all markdown files
  const files = await findMarkdownFiles(KNOWLEDGE_BASE_DIR);
  
  if (files.length === 0) {
    console.warn('[RAG Ingestion] No markdown files found in knowledge-base directory');
    return;
  }
  
  console.log(`[RAG Ingestion] Found ${files.length} markdown file(s)`);
  
  // Process files
  const stats = {
    files: 0,
    chunks: 0,
    scopes: new Set<string>(),
    errors: 0,
  };
  
  for (const file of files) {
    try {
      const result = await processFile(file);
      stats.files++;
      stats.chunks += result.chunks;
      stats.scopes.add(result.scope);
    } catch (error: any) {
      console.error(`[RAG Ingestion] Error processing ${file}:`, error.message);
      stats.errors++;
    }
  }
  
  // Print summary
  console.log('\n[RAG Ingestion] Summary:');
  console.log(`  Files processed: ${stats.files}`);
  console.log(`  Total chunks: ${stats.chunks}`);
  console.log(`  Scopes: ${Array.from(stats.scopes).join(', ')}`);
  if (stats.errors > 0) {
    console.log(`  Errors: ${stats.errors}`);
  }
  console.log('[RAG Ingestion] Ingestion complete!');
}

// Run ingestion
ingest()
  .catch((error) => {
    console.error('[RAG Ingestion] Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

