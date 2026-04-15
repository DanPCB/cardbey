/**
 * Debug Routes
 * 
 * ⚠️ FOR LOCAL/DEV ONLY - NOT FOR PRODUCTION
 * 
 * These routes provide debugging and monitoring capabilities.
 * Should be disabled or protected in production environments.
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  snapshotPairingStats,
  resetPairingStats,
} from '../debug/pairingStats.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/debug/pairing-stats - Get pairing statistics
// Query: ?reset=1 to reset counters after returning
// Response: { ok: true, stats: { initiateCount, peekCount, registerCount, completeCount } }
// ⚠️ FOR LOCAL/DEV ONLY - NOT FOR PRODUCTION
router.get('/pairing-stats', (req, res) => {
  try {
    const shouldReset = req.query.reset === '1' || req.query.reset === 'true';
    
    const stats = snapshotPairingStats();
    
    if (shouldReset) {
      resetPairingStats();
    }
    
    return res.json({
      ok: true,
      stats,
      reset: shouldReset,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Failed to get pairing stats',
    });
  }
});

// GET /api/debug/devices - List all devices (including unpaired)
// Query: 
//   - ?unpaired=1 to show only unpaired devices (tenantId='temp')
//   - ?tenantId=X&storeId=Y to filter by specific tenant/store
// ⚠️ FOR LOCAL/DEV ONLY - NOT FOR PRODUCTION
router.get('/devices', async (req, res) => {
  try {
    const showUnpaired = req.query.unpaired === '1' || req.query.unpaired === 'true';
    const filterTenantId = req.query.tenantId;
    const filterStoreId = req.query.storeId;
    const limit = parseInt(req.query.limit || '50', 10);
    
    const where = {};
    if (showUnpaired) {
      where.OR = [
        { tenantId: 'temp' },
        { storeId: 'temp' },
      ];
    } else if (filterTenantId && filterStoreId) {
      where.tenantId = filterTenantId;
      where.storeId = filterStoreId;
    }
    
    const devices = await prisma.device.findMany({
      where,
      take: limit,
      orderBy: {
        lastSeenAt: 'desc',
      },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        name: true,
        model: true,
        location: true,
        platform: true,
        appVersion: true,
        status: true,
        pairingCode: true,
        lastSeenAt: true,
        createdAt: true,
        bindings: {
          orderBy: { lastPushedAt: 'desc' },
          take: 1,
          select: {
            playlistId: true,
            status: true,
            lastPushedAt: true,
          },
        },
      },
    });
    
    // Calculate online/offline status
    const now = new Date();
    const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
    const threshold = new Date(now.getTime() - ONLINE_THRESHOLD_MS);
    
    const formatted = devices.map(device => ({
      ...device,
      isOnline: device.lastSeenAt && device.lastSeenAt >= threshold,
      isUnpaired: device.tenantId === 'temp' || device.storeId === 'temp',
      hasPairingCode: !!device.pairingCode,
      hasPlaylist: device.bindings && device.bindings.length > 0,
      playlistId: device.bindings?.[0]?.playlistId || null,
    }));
    
    return res.json({
      ok: true,
      devices: formatted,
      count: formatted.length,
      unpairedCount: formatted.filter(d => d.isUnpaired).length,
      pairedCount: formatted.filter(d => !d.isUnpaired).length,
      onlineCount: formatted.filter(d => d.isOnline).length,
    });
  } catch (error) {
    console.error('[Debug] Failed to list devices:', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to list devices',
      message: error.message,
    });
  }
});

// GET /api/debug/store-creation-health
// Returns DraftStore status, last N AuditEvents, last orchestrator task/error for E2E debugging.
// Query: ?limit=5 (default 5 for drafts and events). ⚠️ FOR LOCAL/DEV ONLY
router.get('/store-creation-health', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '5', 10) || 5, 20);

    const [drafts, auditEvents, lastTask] = await Promise.all([
      prisma.draftStore.findMany({
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          status: true,
          committedStoreId: true,
          generationRunId: true,
          updatedAt: true,
          mode: true,
        },
      }),
      prisma.auditEvent.findMany({
        where: {
          entityType: { in: ['DraftStore', 'OrchestratorTask', 'Business'] },
        },
        orderBy: { id: 'desc' },
        take: limit,
        select: {
          id: true,
          entityType: true,
          entityId: true,
          action: true,
          fromStatus: true,
          toStatus: true,
          actorType: true,
          createdAt: true,
        },
      }),
      prisma.orchestratorTask.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          result: true,
          updatedAt: true,
          entryPoint: true,
        },
      }),
    ]);

    return res.json({
      ok: true,
      stepHint: 'Use docs/E2E_STORE_CREATION_CONTRACT.md Steps 1-6 to locate which step is blocked.',
      drafts: drafts.map((d) => ({
        id: d.id,
        status: d.status,
        committedStoreId: d.committedStoreId,
        generationRunId: d.generationRunId,
        updatedAt: d.updatedAt,
        mode: d.mode,
      })),
      lastAuditEvents: auditEvents,
      lastOrchestratorTask: lastTask
        ? {
            id: lastTask.id,
            status: lastTask.status,
            entryPoint: lastTask.entryPoint,
            result: lastTask.result,
            updatedAt: lastTask.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error('[Debug] store-creation-health failed:', error);
    return res.status(500).json({
      ok: false,
      error: 'store_creation_health_failed',
      message: error.message,
    });
  }
});

// GET /api/debug/verify-step6?storeId=...
// Step 6 binary check: store has Smart Object (QR) and loyalty program. Dev-only.
// Returns: { ok, storeId, smartObjectCount, loyaltyProgramExists, step6Pass }.
router.get('/verify-step6', async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : null;
    if (!storeId) {
      return res.status(400).json({
        ok: false,
        error: 'storeId_required',
        message: 'Query storeId is required (e.g. ?storeId=xxx)',
      });
    }

    const [smartObjectCount, loyaltyProgram] = await Promise.all([
      prisma.smartObject.count({ where: { storeId } }),
      prisma.loyaltyProgram.findFirst({ where: { storeId }, select: { id: true } }),
    ]);

    const loyaltyProgramExists = !!loyaltyProgram;
    const step6Pass = smartObjectCount >= 1 && loyaltyProgramExists;

    return res.json({
      ok: true,
      storeId,
      smartObjectCount,
      loyaltyProgramExists,
      step6Pass,
      hint: step6Pass ? 'Step 6 pass: QR + loyalty visible' : 'Step 6 fail: add Smart Object and/or loyalty program for store',
    });
  } catch (error) {
    console.error('[Debug] verify-step6 failed:', error);
    return res.status(500).json({
      ok: false,
      error: 'verify_step6_failed',
      message: error.message,
    });
  }
});

export default router;

