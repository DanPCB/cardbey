# RAG (Retrieval-Augmented Generation) Implementation

## Overview

A minimal but production-ready RAG v1 service has been implemented in cardbey-core. This system allows querying a knowledge base using natural language questions with retrieval-augmented generation.

## Files Created/Modified

### Database Schema
- **`prisma/schema.prisma`**: Added `RagChunk` model with:
  - `id`, `scope`, `sourcePath`, `chunkIndex`, `content`, `embedding`
  - Indexes on `scope` and `(sourcePath, chunkIndex)`
  - Unique constraint on `(sourcePath, chunkIndex)`

### Migration
- **`prisma/migrations/YYYYMMDDHHMMSS_add_rag_chunk/`**: Prisma migration for RagChunk table

### Ingestion Script
- **`scripts/ingestRagKnowledge.ts`**: 
  - Reads markdown files from `knowledge-base/**`
  - Chunks text into ~500 character segments with 80 character overlap
  - Generates embeddings using OpenAI `text-embedding-3-small`
  - Upserts chunks into database

### Service Layer
- **`src/services/ragService.ts`**: 
  - `getRagAnswer()` function for retrieval and answer generation
  - Cosine similarity computation for chunk retrieval
  - OpenAI chat completion integration
  - Returns answer with source citations

### API Routes
- **`src/routes/rag.js`**: 
  - `POST /api/rag/ask` endpoint
  - Request validation
  - Error handling

### Server Integration
- **`src/server.js`**: Registered `/api/rag` routes

### API Client Package
- **`packages/api-client/`**: 
  - TypeScript types: `RagAskRequest`, `RagAskResponse`, `RagAskSource`
  - `ragAsk()` function for dashboard integration

### Tests
- **`tests/rag.test.js`**: Unit tests for RAG endpoint

### Package Configuration
- **`package.json`**: 
  - Added `rag:ingest` script
  - Added `tsx` as dev dependency

## How to Use

### 1. Set Up Knowledge Base

Create markdown files in the `knowledge-base/` directory:

```
knowledge-base/
  device-engine/
    pairing.md
    playlists.md
  dashboard/
    getting-started.md
  content-studio/
    design-guide.md
```

The first directory level determines the `scope` (e.g., `device-engine` → `device_engine`).

### 2. Ingest Knowledge Base

Run the ingestion script:

```bash
npm run rag:ingest
```

This will:
- Read all `.md` and `.mdx` files from `knowledge-base/**`
- Chunk each file into ~500 character segments
- Generate embeddings using OpenAI
- Store chunks in the database

**Requirements:**
- `OPENAI_API_KEY` environment variable must be set
- Database must be migrated (run `npm run db:migrate` if needed)

### 3. Query the RAG System

#### Via HTTP API

```bash
curl -X POST http://localhost:3001/api/rag/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How do I pair a device?",
    "scope": "device_engine"
  }'
```

Response:
```json
{
  "ok": true,
  "answer": "To pair a device, navigate to the pairing screen...",
  "scope": "device_engine",
  "sources": [
    {
      "id": "clx...",
      "sourcePath": "knowledge-base/device-engine/pairing.md",
      "chunkIndex": 0,
      "snippet": "To pair a device, go to the pairing screen..."
    }
  ]
}
```

#### Via TypeScript API Client

```typescript
import { ragAsk } from '@cardbey/api-client';

const response = await ragAsk('http://localhost:3001', {
  question: 'How do I pair a device?',
  scope: 'device_engine'
});

console.log(response.answer);
console.log(response.sources);
```

### 4. Re-ingest After Updates

Simply run `npm run rag:ingest` again. The script uses upserts, so existing chunks will be updated with new content.

## Architecture

### Retrieval Flow

1. **Question Embedding**: User question is converted to embedding vector using OpenAI
2. **Chunk Retrieval**: 
   - Loads up to 200 candidate chunks (filtered by scope if provided)
   - Computes cosine similarity between question embedding and chunk embeddings
   - Selects top 8 most similar chunks
3. **Context Building**: Selected chunks are formatted with source references
4. **LLM Generation**: OpenAI chat completion generates answer based on context
5. **Response**: Returns answer with source citations

### Current Limitations

- **In-Memory Similarity**: Cosine similarity is computed in Node.js (limited to 200 chunks)
- **SQLite Storage**: Embeddings stored as `Bytes` (not optimized for vector search)
- **No pgvector**: PostgreSQL vector extension not yet integrated

### Future Improvements

1. **pgvector Integration**: 
   - Migrate to PostgreSQL with pgvector extension
   - Use `vector` type for embeddings
   - Use `<=>` operator for efficient similarity search

2. **Hybrid Search**:
   - Combine semantic (embedding) and keyword (full-text) search
   - Boost results based on recency or relevance scores

3. **Metadata Enrichment**:
   - Add metadata fields to chunks (author, date, tags)
   - Support filtering by metadata

4. **Caching**:
   - Cache embeddings for frequently asked questions
   - Cache LLM responses for identical queries

5. **Streaming Responses**:
   - Support streaming answers for better UX
   - Show sources as they're retrieved

## Environment Variables

Required:
- `OPENAI_API_KEY`: OpenAI API key for embeddings and chat completion

Optional:
- `DATABASE_URL`: Database connection string (defaults to SQLite)

## Testing

Run tests:

```bash
npm test
```

Tests cover:
- Input validation
- Empty knowledge base handling
- Scope filtering
- Source citation

## Error Handling

The RAG service handles:
- Missing OpenAI API key (returns error)
- Empty knowledge base (returns helpful message)
- Invalid embeddings (skips chunks with errors)
- API timeouts (propagates OpenAI errors)

All errors are returned in consistent format:
```json
{
  "ok": false,
  "error": "error_code",
  "message": "Human-readable error message"
}
```

## Performance Considerations

- **Embedding Generation**: ~100-500ms per chunk (OpenAI API)
- **Similarity Computation**: ~1-10ms for 200 chunks (in-memory)
- **LLM Generation**: ~500-2000ms (OpenAI API)
- **Total Latency**: ~1-3 seconds for typical queries

For production:
- Consider caching embeddings
- Use pgvector for faster similarity search
- Implement request rate limiting
- Add response caching for common queries

