import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { resetDb } from '../src/test/helpers/resetDb.js';

const tmpOutDir = path.join(process.cwd(), 'tmp-cnet-test');
process.env.CNET_OUT_DIR = tmpOutDir;

const { default: app } = await import('../src/server.js');
const prisma = new PrismaClient();

beforeAll(async () => {
  await fs.rm(tmpOutDir, { recursive: true, force: true });
  await resetDb(prisma);
});

afterEach(async () => {
  await resetDb(prisma);
  await fs.rm(tmpOutDir, { recursive: true, force: true });
});

afterAll(async () => {
  await resetDb(prisma);
  await prisma.$disconnect();
});

describe('Workflow prompt to execution', () => {
  it('creates workflow from prompt and executes to mock CNet file', async () => {
    const prompt =
      'Tạo khuyến mãi cho bánh mì phô mai giảm 20% trong 2 phút, hiển thị trên Bakery#5';
    const createRes = await request(app)
      .post('/api/workflows/from-prompt')
      .send({ prompt })
      .expect(200);

    expect(createRes.body.workflow).toBeDefined();
    const workflowId = createRes.body.workflow.id;
    const playlistId = createRes.body.previewPlaylist.playlistId;

    await request(app)
      .post(`/api/workflows/${workflowId}/execute`)
      .expect(200);

    const filePath = path.join(tmpOutDir, `${playlistId}.json`);
    const file = await fs.readFile(filePath, 'utf8');
    const payload = JSON.parse(file);

    expect(payload.playlistId).toBe(playlistId);
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items[0].type).toBe('image');
  });
});

