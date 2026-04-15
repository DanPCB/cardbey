import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { sseHandler, sseCount } from "../sse.js";
import { setupSseHeaders, openSseStream } from "../realtime/sse.js";
import { sseCorsOptions } from "../config/cors.js";

console.log("[SSE] sse.routes.js module loaded");
const router = express.Router();

function getToken(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  if (req.query?.auth) return String(req.query.auth);
  return null;
}

/**
 * OPTIONS handler for CORS preflight - use cors() middleware
 */
router.options("/stream", cors(sseCorsOptions), (req, res) => {
  return res.sendStatus(204);
});

/**
 * Robust SSE handler with proper headers, heartbeat, and cleanup
 * Best practices:
 * - Set headers BEFORE any writes
 * - Don't set Content-Length (streaming)
 * - Send heartbeat comments every 15s
 * - Clean up on client disconnect
 * - Don't end response until client closes
 * 
 * Supports query param ?key=admin for dev mode access
 */
router.get("/stream", cors(sseCorsOptions), (req, res, next) => {
  const origin = req.headers.origin || 'no-origin';
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const key = req.query?.key;
  const label = key === 'admin' ? 'admin' : 'default';
  
  // Log connection attempt with full details
  console.log('[SSE] stream connected (sse.routes)', {
    url: req.originalUrl,
    origin: origin,
    ip: ip,
    key: key || 'none',
    label: label,
  });
  
  // Setup SSE-specific headers including CORS (manual fallback + middleware)
  setupSseHeaders(res, req);

  // Open SSE stream
  const { id } = openSseStream(req, res, { label: `sse.routes-${label}` });
  
  // Send initial connection message
  res.write(`:connected\n\n`);
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, timestamp: Date.now() })}\n\n`);
  
  // Cleanup on disconnect
  req.on('close', () => {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  });
});

/**
 * GET /api/stream/preview - Optional preview stream for thumbnails/text overlays
 * Can be used by Performer AI or other services to push preview content
 * Query params: ?screenId=<id> - target specific screen
 */
router.get("/preview", cors(sseCorsOptions), (req, res) => {
  console.log("[SSE Preview] /stream/preview request", { 
    screenId: req.query.screenId,
    origin: req.headers.origin 
  });

  const isDev = (process.env.NODE_ENV || "development") === "development";
  const key = req.query?.key;
  
  // In dev mode, allow key=admin OR key=public
  if (isDev && (key === "admin" || key === "public")) {
    console.log(`[SSE Preview] Dev mode access granted with key=${key}`);
  } else {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }
    try {
      jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    } catch (e) {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  // Setup SSE-specific headers (CORS already handled by middleware)
  setupSseHeaders(res);

  // Send initial connection message
  res.write(`event: preview.ready\n`);
  res.write(`data: ${JSON.stringify({ 
    screenId: req.query.screenId || null,
    timestamp: Date.now() 
  })}\n\n`);

  // Heartbeat every 15s
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`:preview_heartbeat ${Date.now()}\n\n`);
    } catch (e) {
      clearInterval(heartbeatInterval);
    }
  }, 15000);

  // Cleanup on disconnect
  res.on("close", () => {
    clearInterval(heartbeatInterval);
    console.log("[SSE Preview] client disconnected");
  });

  // Example: Send preview updates (can be called from Performer AI)
  // broadcastPreview(screenId, { type: 'thumbnail', url: '...', text: '...' })
});

export default router;








