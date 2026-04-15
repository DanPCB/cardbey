import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('Screen soft delete', () => {
  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('soft deletes a screen and excludes it from list', async () => {
    // Create a test screen
    const screen = await prisma.screen.create({
      data: {
        fingerprint: 'TEST-FP-001',
        name: 'Test Screen',
        status: 'ONLINE',
        paired: true,
        assignedPlaylistId: null,
      },
    });

    // Verify screen exists
    const beforeList = await testRequest.get('/api/screens').expect(200);
    expect(beforeList.body.ok).toBe(true);
    expect(beforeList.body.items).toBeDefined();
    expect(beforeList.body.items.some((s) => s.id === screen.id)).toBe(true);

    // Delete the screen
    const deleteRes = await testRequest
      .delete(`/api/screens/${screen.id}`)
      .expect(200);
    expect(deleteRes.body).toEqual({ ok: true, id: screen.id });

    // Verify screen is excluded from list
    const afterList = await testRequest.get('/api/screens').expect(200);
    expect(afterList.body.ok).toBe(true);
    expect(afterList.body.items).toBeDefined();
    expect(afterList.body.items.some((s) => s.id === screen.id)).toBe(false);

    // Verify screen still exists in DB with deletedAt set
    const deleted = await prisma.screen.findUnique({
      where: { id: screen.id },
    });
    expect(deleted).toBeTruthy();
    expect(deleted.deletedAt).toBeTruthy();
    expect(deleted.status).toBe('OFFLINE');
    expect(deleted.assignedPlaylistId).toBeNull();
    expect(deleted.lastSeen).toBeNull();
  });

  it('returns 404 when screen is already deleted', async () => {
    // Create and delete a screen
    const screen = await prisma.screen.create({
      data: {
        fingerprint: 'TEST-FP-002',
        name: 'Test Screen 2',
        status: 'ONLINE',
        paired: true,
      },
    });

    await testRequest.delete(`/api/screens/${screen.id}`).expect(200);

    // Try to delete again
    const res = await testRequest
      .delete(`/api/screens/${screen.id}`)
      .expect(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('screen_not_found'); // Already deleted screens are excluded
  });

  it('returns 404 when screen does not exist', async () => {
    const res = await testRequest
      .delete('/api/screens/nonexistent-id')
      .expect(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('screen_not_found');
  });

  it('unassigns playlist when deleting screen', async () => {
    // Create a playlist
    const playlist = await prisma.playlist.create({
      data: {
        name: 'Test Playlist',
      },
    });

    // Create screen with assigned playlist
    const screen = await prisma.screen.create({
      data: {
        fingerprint: 'TEST-FP-003',
        name: 'Test Screen 3',
        status: 'ONLINE',
        paired: true,
        assignedPlaylistId: playlist.id,
      },
    });

    // Delete the screen
    await testRequest.delete(`/api/screens/${screen.id}`).expect(200);

    // Verify playlist is unassigned
    const deleted = await prisma.screen.findUnique({
      where: { id: screen.id },
    });
    expect(deleted.assignedPlaylistId).toBeNull();
  });

  it('includes deleted screens when includeDeleted=1', async () => {
    // Create and delete a screen
    const screen = await prisma.screen.create({
      data: {
        fingerprint: 'TEST-FP-004',
        name: 'Test Screen 4',
        status: 'ONLINE',
        paired: true,
      },
    });

    await testRequest.delete(`/api/screens/${screen.id}`).expect(200);

    // List without includeDeleted (default)
    const normalList = await testRequest.get('/api/screens').expect(200);
    expect(normalList.body.ok).toBe(true);
    expect(normalList.body.items).toBeDefined();
    expect(normalList.body.items.some((s) => s.id === screen.id)).toBe(false);

    // List with includeDeleted=1
    const withDeleted = await testRequest
      .get('/api/screens?includeDeleted=1')
      .expect(200);
    expect(withDeleted.body.ok).toBe(true);
    expect(withDeleted.body.items).toBeDefined();
    expect(withDeleted.body.items.some((s) => s.id === screen.id)).toBe(true);
  });
});

