/**
 * AI Metrics Router
 * Minimal metrics endpoint for Efficiency Pulse
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// GET /metrics (when mounted at /api/ai, becomes /api/ai/metrics)
router.get('/metrics', async (_req, res) => {
  try {
    const [events, suggestions, applied, ignored] = await Promise.all([
      prisma.eventLog.count(),
      prisma.suggestionLog.count(),
      prisma.suggestionLog.count({ where: { status: 'APPLIED' } }),
      prisma.suggestionLog.count({ where: { status: 'IGNORED' } }),
    ]);

    // Per-node stats using groupBy
    const byNodeRaw = await prisma.suggestionLog.groupBy({
      by: ['node', 'status'],
      _count: { _all: true },
    });

    const nodeAgg = {};
    for (const row of byNodeRaw) {
      const key = row.node;
      if (!nodeAgg[key]) {
        nodeAgg[key] = { generated: 0, applied: 0, ignored: 0 };
      }
      nodeAgg[key].generated += row._count._all;
      if (row.status === 'APPLIED') nodeAgg[key].applied += row._count._all;
      if (row.status === 'IGNORED') nodeAgg[key].ignored += row._count._all;
    }

    const byNode = Object.entries(nodeAgg).map(([node, v]) => ({
      node,
      generated: v.generated,
      applied: v.applied,
      ignored: v.ignored,
      successRate: v.generated > 0 ? v.applied / v.generated : 0,
    }));

    // Phase 2: Real latency calculations from database
    const latencyStats = await prisma.suggestionLog.aggregate({
      _avg: {
        latencyZoneAMs: true,
        latencyZoneBMs: true,
        latencyEndToEndMs: true,
      },
      where: {
        latencyEndToEndMs: { not: null },
      },
    });

    // Phase 2: Last 24h time series for charts
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSuggestions = await prisma.suggestionLog.findMany({
      where: {
        createdAt: { gte: last24h },
      },
      select: {
        createdAt: true,
        status: true,
        node: true,
        latencyEndToEndMs: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by hour for sparklines
    const hourlyData = {};
    recentSuggestions.forEach(s => {
      const hour = new Date(s.createdAt).toISOString().substring(0, 13); // YYYY-MM-DDTHH
      if (!hourlyData[hour]) {
        hourlyData[hour] = { generated: 0, applied: 0, avgLatency: [] };
      }
      hourlyData[hour].generated++;
      if (s.status === 'APPLIED') hourlyData[hour].applied++;
      if (s.latencyEndToEndMs) hourlyData[hour].avgLatency.push(s.latencyEndToEndMs);
    });

    const last24hData = Object.entries(hourlyData).map(([hour, data]) => ({
      hour,
      generated: data.generated,
      applied: data.applied,
      avgLatency: data.avgLatency.length > 0
        ? Math.round(data.avgLatency.reduce((a, b) => a + b, 0) / data.avgLatency.length)
        : 0,
    }));

    res.json({
      totals: { events, suggestions, applied, ignored },
      latencyMs: {
        zoneA: Math.round(latencyStats._avg.latencyZoneAMs || 0),
        zoneB: Math.round(latencyStats._avg.latencyZoneBMs || 0),
        endToEnd: Math.round(latencyStats._avg.latencyEndToEndMs || 0),
      },
      acceptanceRate: suggestions ? applied / suggestions : 0,
      byNode,
      runtime: {
        redis: true, // TODO: add Redis ping
        db: true, // If we got here, DB is working
        nodes: {
          pricing: process.env.PRICING_NODE_ENABLED === 'true',
          inventory: process.env.INVENTORY_NODE_ENABLED === 'true',
          marketing: process.env.MARKETING_NODE_ENABLED === 'true',
        },
      },
      // Phase 2: Time series for charts
      last24h: last24hData,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[AI] metrics error:', err);
    res.status(500).json({ error: 'metrics_failed', message: err.message });
  }
});

export default router;

