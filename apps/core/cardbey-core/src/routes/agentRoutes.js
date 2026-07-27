/**
 * Agent Routes — manage and execute sub-agents.
 */

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import agentRegistry from '../services/agents/agentRegistry.js';
import orchestrator from '../services/agents/orchestrator.js';
import messageBus from '../services/agents/messageBus.js';
import agentLifecycle from '../services/agents/agentLifecycle.js';
import { ensureRuntimeAuthorizedContext } from '../lib/runtime/performerRuntime/runtimeOwnership.js';
import { rateLimitMiddleware } from '../services/reliability/rateLimitMiddleware.js';
import { AutoLayoutAgent } from '../lib/agents/autoLayoutAgent.js';

const router = Router();
const autoLayoutAgent = new AutoLayoutAgent();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.capability) filter.capability = String(req.query.capability);
    if (req.query.status) filter.status = String(req.query.status);

    res.json({ ok: true, agents: agentRegistry.list(filter), count: agentRegistry.list(filter).length });
  } catch (error) {
    console.error('[agents/list]', error);
    res.status(500).json({ ok: false, error: 'agents_list_failed' });
  }
});

router.get('/discover', requireAuth, async (req, res) => {
  try {
    const capability = String(req.query.capability ?? '').trim();
    if (!capability) {
      return res.status(400).json({ ok: false, error: 'capability_required' });
    }

    const agents = agentRegistry.findByCapability(capability).map((agent) => ({
      id: agent.id,
      name: agent.name,
      capabilities: agent.capabilities,
      healthy: agentRegistry.isHealthy(agent.id),
      load: agentRegistry.getLoad(agent.id),
    }));

    const best = agentRegistry.findBestAgent(capability);

    res.json({
      ok: true,
      capability,
      agents,
      bestAgent: best ? { id: best.id, name: best.name } : null,
    });
  } catch (error) {
    console.error('[agents/discover]', error);
    res.status(500).json({ ok: false, error: 'agents_discover_failed' });
  }
});

router.post('/parallel', requireAuth, async (req, res) => {
  try {
    const agents = Array.isArray(req.body?.agents) ? req.body.agents : [];
    const context =
      req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};

    if (!agents.length) {
      return res.status(400).json({ ok: false, error: 'agents_required' });
    }

    const result = await orchestrator.parallel(agents, context);
    res.json({ ok: true, result });
  } catch (error) {
    console.error('[agents/parallel]', error);
    res.status(500).json({ ok: false, error: error?.message || 'agents_parallel_failed' });
  }
});

router.post('/chain', requireAuth, async (req, res) => {
  try {
    const agents = Array.isArray(req.body?.agents) ? req.body.agents : [];
    const context =
      req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};

    if (!agents.length) {
      return res.status(400).json({ ok: false, error: 'agents_required' });
    }

    const result = await orchestrator.chain(agents, context);
    res.json({ ok: true, result });
  } catch (error) {
    console.error('[agents/chain]', error);
    res.status(500).json({ ok: false, error: error?.message || 'agents_chain_failed' });
  }
});

router.post('/delegate', requireAuth, async (req, res) => {
  try {
    const capability = String(req.body?.capability ?? '').trim();
    const context =
      req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};

    if (!capability) {
      return res.status(400).json({ ok: false, error: 'capability_required' });
    }

    const result = await orchestrator.delegate(capability, context);
    res.json({ ok: true, result });
  } catch (error) {
    console.error('[agents/delegate]', error);
    res.status(500).json({ ok: false, error: error?.message || 'agents_delegate_failed' });
  }
});

/**
 * POST /api/agents/auto-layout
 * Reformat messy unstructured content into clean readable layout (no side effects).
 */
router.post(
  '/auto-layout',
  rateLimitMiddleware({
    endpoint: '/api/agents/auto-layout',
    windowMs: 60_000,
    maxRequests: 30,
    perUser: false,
  }),
  async (req, res) => {
    try {
      const content = req.body?.content;
      const options =
        req.body?.options && typeof req.body.options === 'object' ? req.body.options : {};

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ success: false, error: 'Content is required' });
      }

      if (content.length > 500_000) {
        return res.status(413).json({ success: false, error: 'Content exceeds 500KB limit' });
      }

      const result = await autoLayoutAgent.process(content, options);

      res.json({
        success: true,
        processed: result.processed,
        type: result.type,
        stats: result.stats,
        original: result.original,
      });
    } catch (error) {
      console.error('[AutoLayoutAgent] Error:', error);
      res.status(500).json({ success: false, error: error?.message || 'auto_layout_failed' });
    }
  },
);

router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const agent = agentRegistry.get(String(req.params.id));
    if (!agent) {
      return res.status(404).json({ ok: false, error: 'agent_not_found' });
    }

    res.json({
      ok: true,
      agent: {
        ...agent,
        handler: undefined,
        healthy: agentRegistry.isHealthy(agent.id),
        health: agentRegistry.getHealth(agent.id),
        load: agentRegistry.getLoad(agent.id),
      },
    });
  } catch (error) {
    console.error('[agents/get]', error);
    res.status(500).json({ ok: false, error: 'agent_get_failed' });
  }
});

router.post(
  '/:id/execute',
  requireAuth,
  rateLimitMiddleware({
    endpoint: '/api/agents/execute',
    windowMs: 60_000,
    maxRequests: 20,
    perUser: true,
  }),
  async (req, res) => {
    try {
      const id = String(req.params.id ?? '').trim();
      const context = ensureRuntimeAuthorizedContext(
        req.body?.context && typeof req.body.context === 'object' ? req.body.context : {},
        null,
        'agent_route_execute',
      );
      context.userId = context.userId ?? req.user?.id ?? null;

      const result = await orchestrator.executeAgent({ id }, context);
      res.json({ ok: true, result });
    } catch (error) {
      console.error('[agents/execute]', error);
      res.status(500).json({ ok: false, error: error?.message || 'agent_execute_failed' });
    }
  },
);

router.get('/:id/health', requireAuth, async (req, res) => {
  try {
    const health = agentLifecycle.checkHealth(String(req.params.id));
    if (!health.ok) {
      return res.status(404).json({ ok: false, error: health.error });
    }
    res.json({ ok: true, ...health });
  } catch (error) {
    console.error('[agents/health/get]', error);
    res.status(500).json({ ok: false, error: 'agent_health_failed' });
  }
});

router.post('/:id/health', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const status = String(req.body?.status ?? 'healthy');
    const agent = agentRegistry.get(id);
    if (!agent) {
      return res.status(404).json({ ok: false, error: 'agent_not_found' });
    }
    if (agent.status !== 'active') {
      agentLifecycle.start(id);
    } else {
      agentLifecycle.heartbeat(id, { status });
    }
    res.json({
      ok: true,
      health: agentRegistry.getHealth(id),
      healthy: agentRegistry.isHealthy(id),
      status: agentRegistry.get(id)?.status,
    });
  } catch (error) {
    console.error('[agents/health/post]', error);
    res.status(500).json({ ok: false, error: 'agent_health_update_failed' });
  }
});

router.post('/:id/start', requireAuth, requireAdmin, async (req, res) => {
  try {
    const agent = agentLifecycle.start(String(req.params.id));
    res.json({ ok: true, agent: { id: agent.id, status: agent.status } });
  } catch (error) {
    res.status(404).json({ ok: false, error: error?.message || 'agent_start_failed' });
  }
});

router.post('/:id/pause', requireAuth, requireAdmin, async (req, res) => {
  try {
    const agent = agentLifecycle.pause(String(req.params.id));
    res.json({ ok: true, agent: { id: agent.id, status: agent.status } });
  } catch (error) {
    res.status(404).json({ ok: false, error: error?.message || 'agent_pause_failed' });
  }
});

router.post('/:id/resume', requireAuth, requireAdmin, async (req, res) => {
  try {
    const agent = agentLifecycle.resume(String(req.params.id));
    res.json({ ok: true, agent: { id: agent.id, status: agent.status } });
  } catch (error) {
    res.status(404).json({ ok: false, error: error?.message || 'agent_resume_failed' });
  }
});

router.post('/:id/terminate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const agent = agentLifecycle.terminate(String(req.params.id));
    res.json({ ok: true, agent: { id: agent.id, status: agent.status } });
  } catch (error) {
    res.status(404).json({ ok: false, error: error?.message || 'agent_terminate_failed' });
  }
});

router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const history = messageBus.getHistory(String(req.params.id), limit);
    res.json({ ok: true, history });
  } catch (error) {
    console.error('[agents/messages]', error);
    res.status(500).json({ ok: false, error: 'agent_messages_failed' });
  }
});

export default router;
