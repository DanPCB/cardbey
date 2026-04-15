import express from "express";
import prisma from "../lib/prisma.js";
import { getDeviceWebSocketHub } from "../realtime/deviceWebSocketHub.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Repair endpoints require auth + admin (security hardening). GET /metrics and /diagnose remain unauthenticated.
const repairGate = [requireAuth, requireAdmin];

// --- SIMPLE METRICS ENDPOINT ---
router.get("/metrics", async (req, res) => {
  try {
    const deviceCount = await prisma.device.count();
    const onlineCount = await prisma.device.count({ 
      where: { 
        status: "online" 
      } 
    });

    const videoCount = await prisma.media.count({ 
      where: { 
        kind: "VIDEO" 
      } 
    });
    const imageCount = await prisma.media.count({ 
      where: { 
        kind: "IMAGE" 
      } 
    });

    const hub = getDeviceWebSocketHub();
    const totalConnections = hub.getConnectedDevices().reduce((sum, deviceId) => {
      return sum + (hub.getConnectionCount(deviceId) || 0);
    }, 0);

    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      devices: { total: deviceCount, online: onlineCount },
      media: { videos: videoCount, images: imageCount },
      backend: {
        sseConnections: totalConnections,
        uptime: process.uptime(),
      }
    });
  } catch (err) {
    console.error("[SystemMetrics] Error:", err);
    return res.status(500).json({ ok: false, error: "metrics_failed" });
  }
});

// --- DIAGNOSE ENDPOINT ---
router.get("/diagnose", async (req, res) => {
  try {
    const now = new Date().toISOString();

    // For now, keep this simple and optimistic.
    const summary = {
      healthy: true,
      issues: 0,
      warnings: 0,
      critical: 0,
      lastCheckAt: now,
    };

    const diagnosis = {
      ok: true,
      summary,
      status: "healthy",
      warnings: [],
      critical: [],
      checks: {
        api: { healthy: true, details: "API reachable" },
        database: { healthy: true, details: "DB OK (not deeply checked yet)" },
        scheduler: { healthy: true, details: "Scheduler assumed OK (stub)" },
        sse: { healthy: true, details: "SSE hub running or not checked" },
      },
      timestamp: now,
    };

    return res.json(diagnosis);
  } catch (err) {
    console.error("[SystemDiagnose] Error:", err);
    return res.status(500).json({
      ok: false,
      summary: {
        healthy: false,
        issues: 1,
        warnings: 0,
        critical: 1,
        lastCheckAt: new Date().toISOString(),
      },
      status: "error",
      warnings: [],
      critical: ["diagnose_failed"],
    });
  }
});

// --- EVENTS ENDPOINT (simple mock for now) ---
router.get("/events/recent", async (req, res) => {
  return res.json({
    ok: true,
    events: [
      { ts: new Date().toISOString(), type: "system", message: "System Guardian initialized" }
    ]
  });
});

// --- REPAIR ENDPOINTS (stubs for now). Gated: requireAuth + requireAdmin. 403 logged when blocked.
router.post("/repair/media-urls", repairGate, async (req, res) => {
  return res.json({ ok: true, status: "media_urls_repaired" });
});

router.post("/repair/refresh-playlists", repairGate, async (req, res) => {
  return res.json({ ok: true, status: "playlists_refreshed" });
});

router.post("/repair/clear-cache", repairGate, async (req, res) => {
  return res.json({ ok: true, status: "cache_cleared" });
});

router.post("/repair/restart-sse", repairGate, async (req, res) => {
  try {
    // Note: deviceWebSocketHub doesn't have a restart method
    // This is a stub for now
    return res.json({ ok: true, status: "sse_restarted" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "restart_failed" });
  }
});

export default router;
