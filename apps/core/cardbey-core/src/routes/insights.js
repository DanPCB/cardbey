/**
 * Insights API Routes
 * 
 * Endpoints for accessing AI-generated insight cards from reports
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { requestLog } from '../middleware/requestLog.js';
import {
  buildInsightAction,
  inferEntryPointFromInsight,
  buildPayloadForEntryPoint,
  isInsightInputErrorLike,
  parseDeviceIdFromReportTags,
} from '../utils/insightActionBuilder.js';

const prisma = new PrismaClient();
const router = express.Router();

// Apply logging to all insight routes
router.use(requestLog);

/**
 * Check if user is admin (for dev-admin-token or users with admin role)
 */
function isAdmin(req) {
  // Check if using dev-admin-token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.includes('dev-admin-token')) {
    return true;
  }
  
  // Check if user has admin role
  if (req.user?.roles) {
    try {
      const roles = typeof req.user.roles === 'string' 
        ? JSON.parse(req.user.roles) 
        : req.user.roles;
      return Array.isArray(roles) && roles.includes('admin');
    } catch (err) {
      return false;
    }
  }
  
  return false;
}

/**
 * Get tenantId from authenticated user context
 * Uses userId as tenantId (common pattern: user owns the tenant)
 * Also checks user's business for associated devices if needed
 * 
 * @param {express.Request} req - Express request object
 * @returns {Promise<string|null>} Tenant ID or null if not found
 */
async function getTenantIdFromUser(req) {
  if (!req.userId) {
    return null;
  }

  // Primary pattern: userId = tenantId (user owns the tenant)
  let tenantId = req.userId;

  // Optional: Try to get tenantId from user's devices if user has a business
  if (req.user?.business) {
    const device = await prisma.device.findFirst({
      where: {
        storeId: req.user.business.id,
      },
      select: {
        tenantId: true,
      },
    });

    if (device?.tenantId) {
      tenantId = device.tenantId;
    }
  }

  return tenantId;
}

/**
 * GET /api/insights
 * Base insights endpoint - returns overview
 * 
 * Response:
 *   {
 *     ok: true,
 *     insights: {
 *       performance: {...},
 *       cai: {...}
 *     }
 *   }
 */
router.get('/insights', requireAuth, async (req, res, next) => {
  try {
    // Return overview of available insights
    res.json({
      ok: true,
      insights: {
        performance: {
          available: true,
          endpoint: '/api/insights/performance',
        },
        cai: {
          available: true,
          endpoint: '/api/insights/cai',
        },
        feed: {
          available: true,
          endpoint: '/api/insights/feed',
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Insights] Error:', error);
    next(error);
  }
});

/**
 * GET /api/insights/performance
 * Performance insights for the tenant
 * 
 * Response:
 *   {
 *     ok: true,
 *     performance: {
 *       devices: {...},
 *       playlists: {...},
 *       errors: {...}
 *     }
 *   }
 */
router.get('/insights/performance', requireAuth, async (req, res, next) => {
  try {
    // Get tenantId from user context
    const tenantId = await getTenantIdFromUser(req);

    // TODO: Implement actual performance metrics
    // For now, return placeholder structure
    res.json({
      ok: true,
      performance: {
        devices: {
          total: 0,
          online: 0,
          offline: 0,
          degraded: 0,
        },
        playlists: {
          total: 0,
          active: 0,
        },
        errors: {
          total: 0,
          recent: [],
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Insights] Performance error:', error);
    next(error);
  }
});

/**
 * GET /api/insights/cai
 * Content AI insights (Content Studio AI activity)
 * 
 * Response:
 *   {
 *     ok: true,
 *     cai: {
 *       generations: {...},
 *       templates: {...}
 *     }
 *   }
 */
router.get('/insights/cai', requireAuth, async (req, res, next) => {
  try {
    // Get tenantId from user context
    const tenantId = await getTenantIdFromUser(req);

    // TODO: Implement actual CAI metrics
    // For now, return placeholder structure
    res.json({
      ok: true,
      cai: {
        generations: {
          total: 0,
          recent: [],
        },
        templates: {
          used: 0,
          popular: [],
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Insights] CAI error:', error);
    next(error);
  }
});

/**
 * GET /api/insights/feed
 * List insights for the current tenant
 * 
 * Query parameters:
 *   - kind?: string - Filter by insight kind (e.g., "daily_tenant", "campaign_performance")
 *   - from?: string - ISO date string for start date filter (on createdAt)
 *   - to?: string - ISO date string for end date filter (on createdAt)
 *   - limit?: number - Maximum number of insights to return (default: 20, max: 100)
 *   - tenantId?: string - (Admin only) Override tenantId to query insights for a specific tenant
 * 
 * Response:
 *   {
 *     ok: true,
 *     insights: Array<{
 *       id: string,
 *       tenantId: string,
 *       reportId: string | null,
 *       kind: string,
 *       severity: string,
 *       title: string,
 *       summaryMd: string,
 *       tags: string | null,
 *       periodKey: string,
 *       createdAt: Date
 *     }>
 *   }
 */
router.get('/insights/feed', requireAuth, async (req, res, next) => {
  try {
    const { kind, from, to, limit, tenantId: queryTenantId } = req.query;
    
    // Get tenantId from user context (or query param for admins)
    let tenantId;
    
    // Allow admins to query any tenant's insights via query parameter
    if (isAdmin(req) && queryTenantId) {
      tenantId = String(queryTenantId);
    } else {
      tenantId = await getTenantIdFromUser(req);
    }

    if (!tenantId) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Missing tenantId. Unable to determine tenant from user context.',
      });
    }

    // Build where clause
    const where = { tenantId };

    if (kind) {
      where.kind = String(kind);
    }

    if (from || to) {
      where.createdAt = {};
      if (from) {
        const fromDate = new Date(String(from));
        if (!isNaN(fromDate.getTime())) {
          where.createdAt.gte = fromDate;
        }
      }
      if (to) {
        const toDate = new Date(String(to));
        if (!isNaN(toDate.getTime())) {
          // Set to end of day
          toDate.setHours(23, 59, 59, 999);
          where.createdAt.lte = toDate;
        }
      }
    }

    const take = limit ? Math.min(Number(limit), 100) : 20; // Default 20, max 100

    const insights = await prisma.tenantInsight.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        tenantId: true,
        reportId: true,
        kind: true,
        severity: true,
        title: true,
        summaryMd: true,
        tags: true,
        periodKey: true,
        createdAt: true,
      },
    });

    const reportIds = [...new Set(insights.map((i) => i.reportId).filter(Boolean))];
    const reportTagRows =
      reportIds.length > 0
        ? await prisma.tenantReport.findMany({
            where: { id: { in: reportIds }, tenantId },
            select: { id: true, tags: true },
          })
        : [];
    const reportIdToDeviceId = Object.fromEntries(
      reportTagRows.map((r) => [r.id, parseDeviceIdFromReportTags(r.tags)]),
    );

    // Attach actions to insights
    const insightsWithActions = insights.map((insight) => {
      const deviceId = insight.reportId ? reportIdToDeviceId[insight.reportId] : null;
      const entryPoint = inferEntryPointFromInsight(
        insight.tags,
        insight.kind,
        insight.title,
        insight.summaryMd,
        { deviceId: deviceId || undefined },
      );

      let action = null;
      if (entryPoint) {
        try {
          const payload = buildPayloadForEntryPoint(entryPoint, insight.tenantId, {
            kind: insight.kind,
            reportId: insight.reportId,
            deviceId: deviceId || undefined,
          });

          // Generate action description from title
          const actionDescription = insight.title.toLowerCase().includes("check")
            ? `Run ${insight.title}`
            : insight.title.toLowerCase().includes("review")
            ? `Review ${insight.title}`
            : insight.title.toLowerCase().includes("setup") || insight.title.toLowerCase().includes("configure")
            ? `Configure ${insight.title}`
            : `Take action: ${insight.title}`;

          action = buildInsightAction({
            description: actionDescription,
            entryPoint,
            payload,
            source: "insight_card",
            priority: insight.severity === "warning" ? "primary" : "secondary",
          });
        } catch (e) {
          if (isInsightInputErrorLike(e)) {
            console.warn(
              '[Insights] insight_action_skipped',
              JSON.stringify({
                event: 'insight_action_skipped',
                code: e.code,
                entryPoint: e.entryPoint,
                insightId: insight.id,
              }),
            );
          } else {
            throw e;
          }
        }
      }

      return {
        ...insight,
        action,
      };
    });

    res.json({
      ok: true,
      insights: insightsWithActions,
    });
  } catch (error) {
    console.error('[Insights] Error listing insights:', error);
    next(error);
  }
});

/**
 * GET /api/insights/feed/:id
 * Get full detail for one insight, optionally with linked report
 * 
 * Query parameters:
 *   - includeReport?: boolean - If true, include the linked report details
 *   - tenantId?: string - (Admin only) Override tenantId to query insights for a specific tenant
 * 
 * Response:
 *   {
 *     ok: true,
 *     insight: TenantInsight,
 *     report?: TenantReport (if includeReport=true and report exists)
 *   }
 * 
 * Errors:
 *   - 401: Missing tenantId
 *   - 404: Insight not found or doesn't belong to tenant
 */
router.get('/insights/feed/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { includeReport, tenantId: queryTenantId } = req.query;
    
    // Get tenantId from user context (or query param for admins)
    let tenantId;
    
    // Allow admins to query any tenant's insights via query parameter
    if (isAdmin(req) && queryTenantId) {
      tenantId = String(queryTenantId);
    } else {
      tenantId = await getTenantIdFromUser(req);
    }

    if (!tenantId) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Missing tenantId. Unable to determine tenant from user context.',
      });
    }

    const insight = await prisma.tenantInsight.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!insight) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Insight not found',
      });
    }

    let deviceId = null;
    if (insight.reportId) {
      const rep = await prisma.tenantReport.findFirst({
        where: { id: insight.reportId, tenantId },
        select: { tags: true },
      });
      deviceId = parseDeviceIdFromReportTags(rep?.tags);
    }

    // Attach action to insight
    const entryPoint = inferEntryPointFromInsight(
      insight.tags,
      insight.kind,
      insight.title,
      insight.summaryMd,
      { deviceId: deviceId || undefined },
    );

    let action = null;
    if (entryPoint) {
      try {
        const payload = buildPayloadForEntryPoint(entryPoint, insight.tenantId, {
          kind: insight.kind,
          reportId: insight.reportId,
          deviceId: deviceId || undefined,
        });

        // Generate action description from title
        const actionDescription = insight.title.toLowerCase().includes("check")
          ? `Run ${insight.title}`
          : insight.title.toLowerCase().includes("review")
          ? `Review ${insight.title}`
          : insight.title.toLowerCase().includes("setup") || insight.title.toLowerCase().includes("configure")
          ? `Configure ${insight.title}`
          : `Take action: ${insight.title}`;

        action = buildInsightAction({
          description: actionDescription,
          entryPoint,
          payload,
          source: "insight_card",
          priority: insight.severity === "warning" ? "primary" : "secondary",
        });
      } catch (e) {
        if (isInsightInputErrorLike(e)) {
          console.warn(
            '[Insights] insight_action_skipped',
            JSON.stringify({
              event: 'insight_action_skipped',
              code: e.code,
              entryPoint: e.entryPoint,
              insightId: insight.id,
            }),
          );
        } else {
          throw e;
        }
      }
    }

    const insightWithAction = {
      ...insight,
      action,
    };

    const response = {
      ok: true,
      insight: insightWithAction,
    };

    // Optionally include linked report
    if (includeReport === 'true' && insight.reportId) {
      const report = await prisma.tenantReport.findFirst({
        where: {
          id: insight.reportId,
          tenantId,
        },
        select: {
          id: true,
          title: true,
          kind: true,
          periodKey: true,
          createdAt: true,
        },
      });

      if (report) {
        response.report = report;
      }
    }

    res.json(response);
  } catch (error) {
    console.error('[Insights] Error getting insight:', error);
    next(error);
  }
});

export default router;
