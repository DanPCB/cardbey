/**
 * External MCP transport (SSE + JSON-RPC-style messages).
 * Auth: Bearer MCP token (per-store). Tool execution: dispatchTool (store context + Google Calendar create).
 *
 * Mounted at /mcp alongside mcpRoutes (resources). Paths: /mcp/sse, /mcp/message, /mcp/info, /mcp/tokens.
 *
 * COMPLIANCE: Mission Execution spine via toolDispatcher; MCP as bridge. One external write tool: create_calendar_event.
 */

import express from 'express';
import {
  validateMcpToken,
  generateMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from '../lib/mcp/mcpTokenService.js';
import { MCP_SERVER_INFO, MCP_TOOL_MANIFEST, EXTERNAL_TO_INTERNAL_TOOL } from '../lib/mcp/mcpToolManifest.js';
import { dispatchTool } from '../lib/toolDispatcher.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function applyMcpCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
}

for (const p of ['/sse', '/message', '/info']) {
  router.options(p, (_req, res) => {
    applyMcpCors(res);
    res.status(204).end();
  });
}

async function requireMcpBearer(req, res, next) {
  applyMcpCors(res);
  const auth = req.headers.authorization ?? '';
  const raw = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!raw) {
    return res.status(401).json({ error: 'MCP token required' });
  }
  const identity = await validateMcpToken(raw);
  if (!identity) {
    return res.status(401).json({ error: 'Invalid or revoked MCP token' });
  }
  req.mcpIdentity = identity;
  next();
}

/**
 * GET /mcp/sse — minimal SSE (endpoint hint). Full MCP stream clients may POST /mcp/message.
 */
router.get('/sse', requireMcpBearer, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable proxy buffering so comment heartbeats reach the client (Cloudflare / nginx).
  res.setHeader('X-Accel-Buffering', 'no');
  applyMcpCors(res);
  res.flushHeaders?.();

  const host = req.get('host') || 'localhost';
  const proto = req.protocol || 'http';
  const fromEnv = (process.env.MCP_SSE_ENDPOINT_URL || '').trim().replace(/\/+$/, '');
  const postUrl = fromEnv || `${proto}://${host}/mcp/message`;
  // MCP clients expect a bare absolute URL in `data`, not JSON (e.g. Streamable HTTP / endpoint hint).
  res.write(`event: endpoint\ndata: ${postUrl}\n\n`);
  res.flush?.();

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
    res.flush?.();
  }, 15000);

  req.on('close', () => clearInterval(heartbeat));
});

/**
 * POST /mcp/message — JSON-RPC-like envelope { id, method, params }
 */
router.post('/message', requireMcpBearer, async (req, res) => {
  applyMcpCors(res);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { id, method, params } = body;
  const { userId, storeId } = req.mcpIdentity;

  const reply = (result) => res.json({ jsonrpc: '2.0', id: id ?? null, result });
  const replyError = (code, message) =>
    res.status(200).json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  try {
    const m = typeof method === 'string' ? method.trim() : '';

    if (m === 'initialize') {
      const initParams =
        params && typeof params === 'object' && !Array.isArray(params) ? params : {};
      const clientProtocol =
        typeof initParams.protocolVersion === 'string' && initParams.protocolVersion.trim()
          ? initParams.protocolVersion.trim()
          : '2024-11-05';
      return reply({
        protocolVersion: clientProtocol,
        capabilities: { tools: {} },
        serverInfo: MCP_SERVER_INFO,
      });
    }

    if (m === 'tools/list') {
      return reply({
        tools: MCP_TOOL_MANIFEST.map(({ _internalTool, ...rest }) => rest),
      });
    }

    if (m === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};

      if (!toolName || typeof toolName !== 'string') {
        return replyError(-32602, 'Missing tool name');
      }

      const internalTool = EXTERNAL_TO_INTERNAL_TOOL[toolName];
      if (!internalTool) {
        return replyError(-32601, `Unknown tool: ${toolName}`);
      }

      const toolInput = {
        ...toolArgs,
        storeId,
      };

      const ctx = {
        userId,
        storeId,
        tenantId: storeId,
        missionId: null,
        executionSource: 'external_mcp_client',
      };

      const dr = await dispatchTool(internalTool, toolInput, ctx);

      if (dr.status !== 'ok') {
        const msg =
          dr.error?.message ||
          dr.blocker?.message ||
          (typeof dr.error === 'string' ? dr.error : null) ||
          'Tool execution failed';
        return replyError(-32603, String(msg));
      }

      const out = dr.output && typeof dr.output === 'object' ? dr.output : {};
      const payload = {
        success: out.success !== false,
        data: out.data ?? null,
        metadata: out.metadata ?? null,
      };

      return reply({
        content: [
          {
            type: 'text',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      });
    }

    if (m === 'notifications/initialized') {
      return res.status(204).end();
    }

    return replyError(-32601, `Method not found: ${m || '(empty)'}`);
  } catch (err) {
    console.error('[MCP Server] message error:', err?.message || err);
    return replyError(-32603, 'Internal error');
  }
});

router.post('/tokens', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id ? String(req.user.id).trim() : '';
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const storeId = req.body?.storeId != null ? String(req.body.storeId).trim() : '';
    const label = req.body?.label != null ? String(req.body.label) : 'MCP Token';
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId required' });
    }
    const { token, label: tokenLabel } = await generateMcpToken({ userId, storeId, label });
    return res.json({
      ok: true,
      token,
      label: tokenLabel,
      message: 'Copy this token now — it will not be shown again.',
    });
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg === 'store_not_found_or_forbidden') {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'Store not found or access denied' });
    }
    next(err);
  }
});

router.get('/tokens', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id ? String(req.user.id).trim() : '';
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const tokens = await listMcpTokens(userId);
    return res.json({ ok: true, tokens });
  } catch (err) {
    next(err);
  }
});

router.delete('/tokens/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id ? String(req.user.id).trim() : '';
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const tokenId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    await revokeMcpToken({ tokenId, userId });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/info', (req, res) => {
  applyMcpCors(res);
  const host = req.get('host') || 'localhost';
  const proto = req.protocol || 'http';
  const base = `${proto}://${host}`;
  res.json({
    server: MCP_SERVER_INFO,
    protocol: 'MCP 2024-11-05 (subset)',
    transport: 'SSE + POST /mcp/message',
    endpoints: {
      sse: `${base}/mcp/sse`,
      message: `${base}/mcp/message`,
      tokens: `${base}/mcp/tokens`,
      info: `${base}/mcp/info`,
    },
    auth: 'Bearer <mcp_token> on /sse and /message; JWT on /tokens',
    tools: MCP_TOOL_MANIFEST.map((t) => ({ name: t.name, description: t.description })),
    readOnly: false,
    mutationsAllowed: true,
    mutationTools: ['create_calendar_event'],
  });
});

export default router;
