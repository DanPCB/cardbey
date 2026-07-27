/**
 * ============================================================
 * LEARNING LAYER — INTEGRATION TESTS
 * ============================================================
 *
 * Verifies actual /api/learning endpoints against the test database.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import app from '../../../server.js';
import { prisma } from '../../prisma.js';

async function ensureLearningTables() {
  try {
    await prisma.$queryRawUnsafe('SELECT 1 FROM learning_user_feedback LIMIT 1');
    return;
  } catch {
    // tables missing — apply migration SQL
  }

  const sqlPath = path.join(
    process.cwd(),
    'prisma/migrations/20260626140000_add_learning_layer_models/migration.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

describe('Learning API Routes (Integration)', () => {
  const testUserId = 'test_integration_user';

  beforeAll(async () => {
    await ensureLearningTables();
    await prisma.userFeedback.deleteMany({ where: { userId: testUserId } });
    await prisma.behaviorPattern.deleteMany({ where: { userId: testUserId } });
    await prisma.userProfile.deleteMany({ where: { userId: testUserId } });
  });

  afterAll(async () => {
    await prisma.userFeedback.deleteMany({ where: { userId: testUserId } });
    await prisma.behaviorPattern.deleteMany({ where: { userId: testUserId } });
    await prisma.userProfile.deleteMany({ where: { userId: testUserId } });
  });

  describe('POST /api/learning/feedback', () => {
    it('should create feedback for a user', async () => {
      const response = await request(app)
        .post('/api/learning/feedback')
        .send({
          userId: testUserId,
          type: 'thumbs_up',
          targetType: 'intent',
          targetId: 'create_store',
          metadata: { confidence: 0.95 },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.feedback).toHaveProperty('id');
      expect(response.body.feedback.type).toBe('thumbs_up');
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app).post('/api/learning/feedback').send({
        type: 'thumbs_up',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('userId is required');
    });

    it('should return 400 when type is missing', async () => {
      const response = await request(app).post('/api/learning/feedback').send({
        userId: testUserId,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('type is required');
    });
  });

  describe('POST /api/learning/correction', () => {
    it('should record a correction', async () => {
      const response = await request(app)
        .post('/api/learning/correction')
        .send({
          userId: testUserId,
          originalIntent: 'create_store',
          correctedIntent: 'add_product',
          context: { storeId: 'store_123' },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.feedback.type).toBe('correction');
      expect(response.body.feedback.metadata.original).toBe('create_store');
      expect(response.body.feedback.metadata.corrected).toBe('add_product');
    });

    it('should return 400 when originalIntent is missing', async () => {
      const response = await request(app).post('/api/learning/correction').send({
        userId: testUserId,
        correctedIntent: 'add_product',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('originalIntent and correctedIntent are required');
    });
  });

  describe('GET /api/learning/feedback', () => {
    it('should get feedback for a user', async () => {
      const response = await request(app).get(`/api/learning/feedback?userId=${testUserId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.feedback).toBeInstanceOf(Array);
      expect(response.body.feedback.length).toBeGreaterThan(0);
    });

    it('should filter feedback by type', async () => {
      const response = await request(app).get(
        `/api/learning/feedback?userId=${testUserId}&type=correction`,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.feedback.every((f) => f.type === 'correction')).toBe(true);
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app).get('/api/learning/feedback');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('userId is required');
    });
  });

  describe('GET /api/learning/profile', () => {
    it('should get profile for a user', async () => {
      const response = await request(app).get(`/api/learning/profile?userId=${testUserId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('profile');
      expect(response.body).toHaveProperty('patterns');
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app).get('/api/learning/profile');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('userId is required');
    });
  });

  describe('POST /api/learning/implicit', () => {
    it('should record implicit feedback', async () => {
      const response = await request(app).post('/api/learning/implicit').send({
        userId: testUserId,
        action: 'skip',
        metadata: { stepId: 'step_1' },
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.feedback.type).toBe('skip');
    });

    it('should return 400 when action is missing', async () => {
      const response = await request(app).post('/api/learning/implicit').send({
        userId: testUserId,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('action is required');
    });
  });

  describe('GET /api/learning/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/learning/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('healthy');
      expect(response.body.stats).toHaveProperty('feedbackCount');
      expect(response.body.stats).toHaveProperty('patternCount');
      expect(response.body.stats).toHaveProperty('profileCount');
    });
  });

  describe('database persistence', () => {
    it('persists feedback rows for the test user', async () => {
      const count = await prisma.userFeedback.count({ where: { userId: testUserId } });
      expect(count).toBeGreaterThan(0);
    });
  });
});
