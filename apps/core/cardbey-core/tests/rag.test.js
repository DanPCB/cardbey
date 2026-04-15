import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

// Ensure consistent behavior locally (CI already sets this)
process.env.NODE_ENV = 'test';

describe('RAG API', () => {
  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  describe('POST /api/rag/ask', () => {
    it('should return 400 if question is missing', async () => {
      const response = await testRequest
        .post('/api/rag/ask')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error).toBe('validation_error');
    });

    it('should return 400 if question is empty', async () => {
      const response = await testRequest
        .post('/api/rag/ask')
        .send({ question: '' });

      expect(response.status).toBe(400);
      expect(response.body.ok).toBe(false);
    });

    it('should return answer with sources when knowledge base has content', async () => {
      // Create test chunks with mock embeddings
      const testEmbedding1 = new Float32Array(1536).fill(0.1);
      const testEmbedding2 = new Float32Array(1536).fill(0.2);
      testEmbedding1[0] = 0.5; // Make first chunk more similar
      testEmbedding2[0] = 0.3;

      await prisma.ragChunk.create({
        data: {
          scope: 'device_engine',
          sourcePath: 'knowledge-base/device-engine/pairing.md',
          chunkIndex: 0,
          content: 'To pair a device, go to the pairing screen and enter the code.',
          embedding: Buffer.from(testEmbedding1.buffer),
        },
      });

      await prisma.ragChunk.create({
        data: {
          scope: 'device_engine',
          sourcePath: 'knowledge-base/device-engine/pairing.md',
          chunkIndex: 1,
          content: 'Device pairing requires a stable network connection.',
          embedding: Buffer.from(testEmbedding2.buffer),
        },
      });

      const response = await testRequest
        .post('/api/rag/ask')
        .send({
          question: 'How do I pair a device?',
          scope: 'device_engine',
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(Array.isArray(response.body.sources)).toBe(true);
      expect(response.body.sources.length).toBeGreaterThan(0);
      // ensure returned sources are the right scope by path convention used in this test
      expect(response.body.sources.every(s => String(s.sourcePath).includes('device-engine'))).toBe(true);
      // basic shape
      expect(response.body.sources[0]).toHaveProperty('id');
      expect(response.body.sources[0]).toHaveProperty('snippet');

      // Clean up
      await prisma.ragChunk.deleteMany({});
    });

    it('should return empty sources when no knowledge base content exists', async () => {
      // Ensure no chunks exist
      const count = await prisma.ragChunk.count();
      expect(count).toBe(0);

      const response = await testRequest
        .post('/api/rag/ask')
        .send({
          question: 'How do I pair a device?',
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(Array.isArray(response.body.sources)).toBe(true);
      expect(response.body.sources.length).toBe(0);
    });

    it('should filter by scope when provided', async () => {
      // Create chunks in different scopes
      const testEmbedding = new Float32Array(1536).fill(0.1);
      const buffer = Buffer.from(testEmbedding.buffer);

      await prisma.ragChunk.create({
        data: {
          scope: 'device_engine',
          sourcePath: 'knowledge-base/device-engine/test.md',
          chunkIndex: 0,
          content: 'Device engine content',
          embedding: buffer,
        },
      });

      await prisma.ragChunk.create({
        data: {
          scope: 'dashboard',
          sourcePath: 'knowledge-base/dashboard/test.md',
          chunkIndex: 0,
          content: 'Dashboard content',
          embedding: buffer,
        },
      });

      const response = await testRequest
        .post('/api/rag/ask')
        .send({
          question: 'Test question',
          scope: 'device_engine',
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(Array.isArray(response.body.sources)).toBe(true);
      // Only device_engine results should show up
      expect(response.body.sources.every(s => String(s.sourcePath).includes('device-engine'))).toBe(true);

      // Clean up
      await prisma.ragChunk.deleteMany({});
    });
  });
});

