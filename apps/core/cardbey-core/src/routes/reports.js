/**
 * Reports API Routes
 * 
 * Endpoints for generating and managing tenant reports
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import {
  generateDailyTenantReport,
  generateDailyDeviceReport,
  generateWeeklyTenantReport,
  generateContentStudioActivityReport,
  generateCampaignPerformanceReport,
  generateCaiUsageReport,
  generateDeviceHealthReport,
  generateWeeklyAiSummaryReport,
} from '../services/reportService.js';
import { requireAuth } from '../middleware/auth.js';
import { requestLog } from '../middleware/requestLog.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { generateReportPdf } from '../utils/reportPdf.js';
import { generateReportExecutiveSummary } from '../services/reportService.js';
import {
  inferEntryPointFromInsight,
  buildPayloadForEntryPoint,
  buildInsightAction,
  isInsightInputErrorLike,
  parseDeviceIdFromReportTags,
} from '../utils/insightActionBuilder.js';

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

const prisma = new PrismaClient();
const router = express.Router();

// Apply logging to all report routes
router.use(requestLog);

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
  // This matches the pattern used in signageRoutes and other tenant-scoped routes
  let tenantId = req.userId;

  // Optional: Try to get tenantId from user's devices if user has a business
  // This provides more accurate tenantId if user has devices
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
 * POST /api/admin/tenants/:tenantId/reports/daily
 * Generate a daily report for a tenant
 * 
 * Request body (optional):
 *   - date?: string (ISO date string, defaults to today)
 * 
 * Response:
 *   {
 *     ok: true,
 *     report: TenantReport
 *   }
 */
router.post('/admin/tenants/:tenantId/reports/daily', requireAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { date } = req.body;

    // Parse date (default to today, set time to 00:00)
    let reportDate = new Date();
    reportDate.setHours(0, 0, 0, 0);
    if (date) {
      reportDate = new Date(date);
      if (isNaN(reportDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      reportDate.setHours(0, 0, 0, 0);
    }

    console.log(`[Reports] Generating daily report for tenant ${tenantId} for ${reportDate.toISOString().split('T')[0]}`);

    // Generate report
    const report = await generateDailyTenantReport(tenantId, reportDate);

    res.json({
      ok: true,
      report,
    });
  } catch (error) {
    console.error('[Reports] Error generating report:', error);
    next(error);
  }
});

/**
 * GET /api/reports
 * List reports for the current tenant with pagination and search
 * 
 * Query parameters:
 *   - kind?: string - Filter by report kind. Supported values:
 *       - "daily_tenant" - Daily tenant activity reports
 *       - "daily_device" - Daily device-specific reports
 *       - "weekly_tenant" - Weekly tenant activity reports
 *       - "content_studio_activity" - Content Studio activity reports
 *       - "campaign_performance" - Campaign performance reports
 *       - "cai_usage" - CAI usage reports
 *       - "device_health" - Device health reports
 *   - from?: string - ISO date string for start date filter
 *   - to?: string - ISO date string for end date filter
 *   - q?: string - Search term (searches in title, kind, tags)
 *   - cursor?: string - Pagination cursor (report ID from previous response)
 *   - limit?: number - Maximum number of reports to return (default: 50, max: 100)
 *   - tenantId?: string - (Admin only) Override tenantId to query reports for a specific tenant
 * 
 * Response:
 *   {
 *     ok: true,
 *     reports: Array<{
 *       id: string,
 *       tenantId: string,
 *       kind: string,
 *       periodKey: string,
 *       title: string,
 *       scope: string,
 *       tags: string | null,
 *       createdAt: Date
 *     }>,
 *     pagination: {
 *       hasMore: boolean,
 *       nextCursor: string | null,
 *       limit: number
 *     }
 *   }
 */
router.get('/reports', requireAuth, async (req, res, next) => {
  try {
    const { kind, from, to, q, cursor, limit, tenantId: queryTenantId } = req.query;
    
    // Get tenantId from user context (or query param for admins)
    let tenantId;
    
    // Allow admins to query any tenant's reports via query parameter
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

    // Search functionality - search in title, kind, and tags
    if (q) {
      const searchTerm = String(q).trim();
      if (searchTerm) {
        where.OR = [
          { title: { contains: searchTerm } },
          { kind: { contains: searchTerm } },
          { tags: { contains: searchTerm } },
        ];
      }
    }

    // Cursor-based pagination
    // Since we order by createdAt desc, we use createdAt + id for cursor
    // The cursor condition must be ANDed with all other conditions
    if (cursor) {
      // Decode cursor: format is "createdAt_iso|id"
      try {
        const [cursorDateStr, cursorId] = cursor.split('|');
        const cursorDate = new Date(cursorDateStr);
        
        if (!isNaN(cursorDate.getTime()) && cursorId) {
          const cursorCondition = {
            OR: [
              {
                createdAt: { lt: cursorDate },
              },
              {
                createdAt: cursorDate,
                id: { lt: cursorId },
              },
            ],
          };

          // Combine cursor with existing conditions using AND
          // If we have OR conditions (from search), wrap everything properly
          if (where.OR) {
            // We need: (search OR conditions) AND (cursor condition)
            const searchOr = { OR: where.OR };
            delete where.OR;
            where.AND = [
              ...(where.AND || []),
              searchOr,
              cursorCondition,
            ];
          } else {
            // No search OR, just add cursor condition
            where.AND = [
              ...(where.AND || []),
              cursorCondition,
            ];
          }
        }
      } catch (err) {
        // Invalid cursor format, ignore it
        console.warn('[Reports] Invalid cursor format:', cursor);
      }
    }

    const take = limit ? Math.min(Number(limit), 100) : 50; // Cap at 100
    const fetchLimit = take + 1; // Fetch one extra to determine if there's a next page

    const reports = await prisma.tenantReport.findMany({
      where,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' }, // Secondary sort for consistent pagination
      ],
      take: fetchLimit,
      select: {
        id: true,
        tenantId: true,
        kind: true,
        periodKey: true,
        title: true,
        scope: true,
        tags: true,
        createdAt: true,
      },
    });

    // Determine if there's a next page
    const hasMore = reports.length > take;
    const items = hasMore ? reports.slice(0, take) : reports;
    
    // Generate next cursor from the last item
    let nextCursor = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      // Cursor format: "createdAt_iso|id"
      nextCursor = `${lastItem.createdAt.toISOString()}|${lastItem.id}`;
    }

    res.json({
      ok: true,
      reports: items,
      pagination: {
        hasMore,
        nextCursor,
        limit: take,
      },
    });
  } catch (error) {
    console.error('[Reports] Error listing reports:', error);
    next(error);
  }
});

/**
 * GET /api/reports/:id
 * Get full detail for one report
 * 
 * Response:
 *   {
 *     ok: true,
 *     report: TenantReport (full object including contentMd)
 *   }
 * 
 * Errors:
 *   - 401: Missing tenantId
 *   - 404: Report not found or doesn't belong to tenant
 */
router.get('/reports/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tenantId: queryTenantId } = req.query;
    
    // Get tenantId from user context (or query param for admins)
    let tenantId;
    
    // Allow admins to query any tenant's reports via query parameter
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

    const report = await prisma.tenantReport.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!report) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Report not found',
      });
    }

    // Attach suggestedExperiments for content_studio_activity reports
    // Attach suggestedActions for daily_device reports
    let reportWithExperiments = { ...report };
    
    if (report.kind === 'content_studio_activity') {
      // For content studio reports, we need to determine if activity was low
      // Since suggestedExperiments is not stored in DB, we compute it on-the-fly
      // Parse the periodKey to get date range
      const periodMatch = report.periodKey.match(/^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/);
      if (periodMatch) {
        const startDate = new Date(periodMatch[1]);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(periodMatch[2]);
        endDate.setHours(23, 59, 59, 999);

        // Query actual activity to determine if it's low
        const contents = await prisma.content.findMany({
          where: {
            userId: tenantId,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          select: {
            id: true,
            updatedAt: true,
            createdAt: true,
          },
        });

        const aiEvents = await prisma.activityEvent.findMany({
          where: {
            tenantId,
            type: {
              in: ['assistant_good_answer', 'assistant_bad_answer'],
            },
            occurredAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          select: {
            id: true,
          },
        });

        const designsCreated = contents.length;
        const designsEdited = contents.filter((c) => c.updatedAt > c.createdAt).length;
        const isLowActivity = designsCreated === 0 && designsEdited === 0 && aiEvents.length === 0;

        if (isLowActivity) {
          const { buildLowActivitySuggestedExperiments } = await import('../services/reports/studioSuggestedExperiments.js');
          reportWithExperiments.suggestedExperiments = buildLowActivitySuggestedExperiments({ tenantId });
          
          // Also add markdown text for backward compatibility
          const experimentsMarkdown = reportWithExperiments.suggestedExperiments
            .map((exp) => `- **${exp.title}**: ${exp.body}`)
            .join('\n');
          reportWithExperiments.suggestedExperimentsText = `## Suggested Next Experiments\n\n${experimentsMarkdown}`;
        } else {
          reportWithExperiments.suggestedExperiments = [];
          reportWithExperiments.suggestedExperimentsText = '';
        }
      } else {
        // Fallback: check contentMd for low activity indicators
        const isLowActivity = 
          report.contentMd.toLowerCase().includes('no activity') ||
          report.contentMd.toLowerCase().includes('no data') ||
          report.contentMd.toLowerCase().includes('0 designs') ||
          report.contentMd.toLowerCase().includes('no designs');
        
        if (isLowActivity) {
          const { buildLowActivitySuggestedExperiments } = await import('../services/reports/studioSuggestedExperiments.js');
          reportWithExperiments.suggestedExperiments = buildLowActivitySuggestedExperiments({ tenantId });
          
          const experimentsMarkdown = reportWithExperiments.suggestedExperiments
            .map((exp) => `- **${exp.title}**: ${exp.body}`)
            .join('\n');
          reportWithExperiments.suggestedExperimentsText = `## Suggested Next Experiments\n\n${experimentsMarkdown}`;
        } else {
          reportWithExperiments.suggestedExperiments = [];
          reportWithExperiments.suggestedExperimentsText = '';
        }
      }
    } else if (report.kind === 'daily_device') {
      // For daily device reports, compute suggestedActions on-the-fly if not present
      if (!report.suggestedActions) {
        // Extract deviceId from tags (format: "daily,device_activity,device:DEVICE_ID")
        const deviceTagMatch = report.tags?.match(/device:([^,]+)/);
        const deviceId = deviceTagMatch ? deviceTagMatch[1] : null;
        
        if (deviceId) {
          const { buildDeviceSuggestedActions } = await import('../services/reports/deviceSuggestedActions.js');
          reportWithExperiments.suggestedActions = buildDeviceSuggestedActions({ tenantId, deviceId });
          
          // Also add markdown text for backward compatibility
          const actionsMarkdown = reportWithExperiments.suggestedActions
            .map((action) => `- ${action.body}`)
            .join('\n');
          reportWithExperiments.suggestedActionsText = `## Suggested Actions\n\n${actionsMarkdown}`;
        } else {
          reportWithExperiments.suggestedActions = [];
          reportWithExperiments.suggestedActionsText = '';
        }
      }
    } else if (report.kind === 'campaign_performance') {
      // For campaign performance reports, compute suggestedActions on-the-fly if not present
      if (!report.suggestedActions) {
        // Try to extract campaignId from contentMd or use null for all campaigns
        // The report content may mention a best-performing campaign, but we'll use null for now
        // In a production system, you might store campaignId in tags or a separate field
        const { buildCampaignSuggestedActions } = await import('../services/reports/campaignSuggestedActions.js');
        reportWithExperiments.suggestedActions = buildCampaignSuggestedActions({ 
          tenantId, 
          campaignId: null 
        });
        
        // Also add markdown text for backward compatibility
        if (reportWithExperiments.suggestedActions.length > 0) {
          const actionsMarkdown = reportWithExperiments.suggestedActions
            .map((action) => `- **${action.title}**: ${action.body}`)
            .join('\n');
          reportWithExperiments.suggestedActionsText = `## Suggested Actions\n\n${actionsMarkdown}`;
        } else {
          reportWithExperiments.suggestedActionsText = '';
        }
      }
    } else {
      // For other reports, ensure the fields exist but are empty
      reportWithExperiments.suggestedExperiments = [];
      reportWithExperiments.suggestedExperimentsText = '';
      reportWithExperiments.suggestedActions = [];
      reportWithExperiments.suggestedActionsText = '';
    }

    // Attach insights with actions for all report types
    const insights = await prisma.tenantInsight.findMany({
      where: {
        reportId: report.id,
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
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

    const reportDeviceId = parseDeviceIdFromReportTags(report.tags);

    // Attach actions to insights
    const insightsWithActions = insights.map((insight) => {
      const entryPoint = inferEntryPointFromInsight(
        insight.tags,
        insight.kind,
        insight.title,
        insight.summaryMd,
        { deviceId: reportDeviceId || undefined },
      );

      let action = null;
      if (entryPoint) {
        try {
          const payload = buildPayloadForEntryPoint(entryPoint, insight.tenantId, {
            kind: insight.kind,
            reportId: insight.reportId,
            deviceId: reportDeviceId || undefined,
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
            source: "report",
            priority: insight.severity === "warning" ? "primary" : "secondary",
          });
        } catch (e) {
          if (isInsightInputErrorLike(e)) {
            console.warn(
              '[Reports] insight_action_skipped',
              JSON.stringify({
                event: 'insight_action_skipped',
                code: e.code,
                entryPoint: e.entryPoint,
                reportId: report.id,
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

    reportWithExperiments.insights = insightsWithActions;

    // Build and register MIEntity for the report (if it's a PDF report)
    let entity = null;
    let miEntityRecord = null;
    if (report.kind === 'daily_tenant' || report.kind === 'daily_device' || report.kind === 'content_studio_activity') {
      try {
        const { buildMIEntity } = await import('../mi/buildMIEntity.js');
        const { registerOrUpdateEntity, getEntityByLink } = await import('../services/miService.js');
        const tenantId = report.tenantId;
        
        // Check if MIEntity already exists
        miEntityRecord = await getEntityByLink({ reportId: report.id });
        
        if (!miEntityRecord) {
          // Build and register new MIEntity
          entity = buildMIEntity({
            productId: report.id,
            productType: 'pdf_report',
            fileUrl: `/api/reports/${report.id}/pdf`, // PDF download URL
            previewUrl: `/api/reports/${report.id}`, // Report detail URL
            mediaType: 'pdf',
            createdByUserId: tenantId, // Use tenantId as userId fallback
            createdByEngine: 'creative_engine_v3',
            sourceProjectId: report.id,
            tenantId,
            locales: ['vi-VN', 'en-AU'],
          });

          // Register in database
          miEntityRecord = await registerOrUpdateEntity({
            productId: entity.productId,
            productType: entity.productType,
            mediaType: entity.format.mediaType,
            fileUrl: entity.format.fileUrl,
            previewUrl: entity.format.previewUrl,
            dimensions: entity.format.dimensions,
            orientation: entity.format.orientation,
            durationSec: entity.format.durationSec,
            createdByUserId: entity.origin.createdByUserId,
            createdByEngine: entity.origin.createdByEngine,
            sourceProjectId: entity.origin.sourceProjectId,
            tenantId: entity.miBrain.context?.tenantId,
            storeId: entity.miBrain.context?.storeId,
            campaignId: entity.miBrain.context?.campaignId,
            miBrain: entity.miBrain,
            status: entity.miBrain.lifecycle?.status || 'active',
            validFrom: entity.miBrain.lifecycle?.validFrom,
            validTo: entity.miBrain.lifecycle?.validTo,
            links: {
              reportId: report.id,
            },
          });
        } else {
          // Convert stored MIEntity to type format for backward compatibility
          entity = {
            productId: miEntityRecord.productId,
            productType: miEntityRecord.productType,
            format: {
              mediaType: miEntityRecord.mediaType,
              fileUrl: miEntityRecord.fileUrl,
              previewUrl: miEntityRecord.previewUrl || undefined,
              dimensions: miEntityRecord.dimensions || undefined,
              orientation: miEntityRecord.orientation,
              durationSec: miEntityRecord.durationSec || undefined,
            },
            origin: {
              createdByUserId: miEntityRecord.createdByUserId,
              createdByEngine: miEntityRecord.createdByEngine,
              sourceProjectId: miEntityRecord.sourceProjectId || undefined,
              createdAt: miEntityRecord.createdAt.toISOString(),
            },
            miBrain: miEntityRecord.miBrain,
          };
        }
      } catch (err) {
        console.warn('[Reports] Failed to build/register MIEntity for report:', err);
        // Non-critical, continue without entity
      }
    }

    res.json({
      ok: true,
      report: reportWithExperiments,
      entity, // MIEntity type for Stage 1 (backward compatibility)
      miEntity: miEntityRecord, // Registered MIEntity record
    });
  } catch (error) {
    console.error('[Reports] Error getting report:', error);
    next(error);
  }
});

/**
 * GET /api/reports/:id/pdf
 * Export a report as PDF
 * 
 * Response:
 *   - PDF file with Content-Type: application/pdf
 *   - Content-Disposition: attachment; filename="<slugified-title>.pdf"
 * 
 * Errors:
 *   - 401: Missing tenantId
 *   - 404: Report not found or doesn't belong to tenant
 *   - 500: PDF generation failed
 */
router.get('/reports/:id/pdf', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tenantId: queryTenantId } = req.query;
    
    // Get tenantId from user context (or query param for admins)
    let tenantId;
    
    // Allow admins to query any tenant's reports via query parameter
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

    const report = await prisma.tenantReport.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!report) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Report not found',
      });
    }

    // Generate executive summary (non-blocking, graceful fallback)
    let summaryData = null;
    try {
      console.log(`[Reports] Generating executive summary for report ${id}`);
      const startTime = Date.now();
      summaryData = await generateReportExecutiveSummary(report);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      if (summaryData) {
        console.log(`[Reports] ✓ Executive summary generated in ${duration}s`);
      } else {
        console.log(`[Reports] No executive summary generated (content too short or AI unavailable)`);
      }
    } catch (summaryError) {
      console.warn(`[Reports] Failed to generate executive summary, continuing without it:`, summaryError.message);
      // Continue without summary - PDF will still be generated
    }

    // Fetch tenant name for PDF
    let tenantName = report.tenantId; // Fallback to tenantId
    try {
      // Try to get Business name (tenantId is often userId, and Business.userId is unique)
      const business = await prisma.business.findUnique({
        where: { userId: report.tenantId },
        select: {
          name: true,
        },
      });
      
      if (business?.name) {
        tenantName = business.name;
      } else {
        // Fallback: try to get Business name via Device -> Store
        const device = await prisma.device.findFirst({
          where: { tenantId: report.tenantId },
          select: {
            storeId: true,
          },
        });
        
        if (device?.storeId) {
          const businessByStore = await prisma.business.findUnique({
            where: { id: device.storeId },
            select: {
              name: true,
            },
          });
          
          if (businessByStore?.name) {
            tenantName = businessByStore.name;
          }
        }
      }
    } catch (tenantNameError) {
      console.warn(`[Reports] Failed to fetch tenant name, using tenantId:`, tenantNameError.message);
      // Continue with tenantId as fallback
    }

    // Generate PDF
    try {
      console.log(`[Reports] Generating PDF for report ${id} (kind: ${report.kind}, tenant: ${tenantName})`);
      const pdfStartTime = Date.now();
      const pdfBuffer = await generateReportPdf(report, { summaryData, tenantName });
      const pdfDuration = ((Date.now() - pdfStartTime) / 1000).toFixed(2);

      // Validate buffer
      if (!Buffer.isBuffer(pdfBuffer)) {
        throw new Error('PDF generation did not return a valid buffer');
      }

      if (pdfBuffer.length === 0) {
        throw new Error('PDF generation returned an empty buffer');
      }

      // Generate filename from title or use report ID
      const filename = report.title
        ? report.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') + '.pdf'
        : `report-${id}.pdf`;

      // Set headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Cache-Control', 'no-cache');

      console.log(`[Reports] Generated PDF for report ${id} (${pdfBuffer.length} bytes) in ${pdfDuration}s`);

      // Send PDF buffer
      res.send(pdfBuffer);
    } catch (pdfError) {
      console.error('[Reports] Error generating PDF:', pdfError);
      console.error('[Reports] PDF Error message:', pdfError.message);
      console.error('[Reports] PDF Error stack:', pdfError.stack);
      
      // Provide more detailed error message for debugging
      let errorMessage = 'Failed to generate report PDF';
      if (pdfError.message) {
        errorMessage = pdfError.message;
      }
      
      return res.status(500).json({
        ok: false,
        error: 'pdf_generation_failed',
        message: errorMessage,
      });
    }
  } catch (error) {
    console.error('[Reports] Error exporting report as PDF:', error);
    next(error);
  }
});

/**
 * POST /api/admin/tenants/:tenantId/reports/daily-device
 * Generate a daily device report
 * 
 * Request body:
 *   - date?: string (ISO date string, defaults to today)
 *   - deviceId: string (required) - Device ID
 * 
 * Response:
 *   {
 *     ok: true,
 *     report: TenantReport
 *   }
 */
router.post('/admin/tenants/:tenantId/reports/daily-device', requireAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { date, deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: 'deviceId is required',
      });
    }

    // Parse date (default to today, set time to 00:00)
    let reportDate = new Date();
    reportDate.setHours(0, 0, 0, 0);
    if (date) {
      reportDate = new Date(date);
      if (isNaN(reportDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      reportDate.setHours(0, 0, 0, 0);
    }

    console.log(`[Reports] Generating daily device report for tenant ${tenantId}, device ${deviceId} for ${reportDate.toISOString().split('T')[0]}`);

    // Generate report
    const report = await generateDailyDeviceReport(tenantId, deviceId, reportDate);

    res.json({
      ok: true,
      report,
    });
  } catch (error) {
    console.error('[Reports] Error generating daily device report:', error);
    next(error);
  }
});

/**
 * POST /api/admin/tenants/:tenantId/reports/weekly
 * Generate a weekly tenant report
 * 
 * Request body:
 *   - weekStart?: string (ISO date string, defaults to Monday of last week)
 * 
 * Response:
 *   {
 *     ok: true,
 *     report: TenantReport
 *   }
 */
router.post('/admin/tenants/:tenantId/reports/weekly', requireAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { weekStart } = req.body;

    // Compute weekStart (either from body or previous Monday)
    let weekStartDate;
    if (weekStart) {
      weekStartDate = new Date(weekStart);
      if (isNaN(weekStartDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid weekStart format. Use ISO date string (YYYY-MM-DD)',
        });
      }
    } else {
      // Default to previous Monday (or Sunday if today is Monday)
      // Compute the Monday of the week that just ended
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      // Calculate days to subtract to get to Monday of current week
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      // Then subtract 7 more days to get to previous week's Monday
      weekStartDate = new Date(now);
      weekStartDate.setDate(now.getDate() - daysToMonday - 7);
      weekStartDate.setHours(0, 0, 0, 0);
    }

    console.log(`[Reports] Generating weekly report for tenant ${tenantId} for week starting ${weekStartDate.toISOString().split('T')[0]}`);

    // Generate report
    const report = await generateWeeklyTenantReport(tenantId, weekStartDate);

    res.json({
      ok: true,
      report,
    });
  } catch (error) {
    console.error('[Reports] Error generating weekly report:', error);
    next(error);
  }
});

/**
 * POST /api/admin/tenants/:tenantId/reports/content-studio
 * Generate a content studio activity report
 * 
 * Request body:
 *   - from?: string (ISO date string, defaults to 7 days ago)
 *   - to?: string (ISO date string, defaults to today)
 * 
 * Response:
 *   {
 *     ok: true,
 *     report: TenantReport
 *   }
 */
router.post('/admin/tenants/:tenantId/reports/content-studio', requireAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { from, to } = req.body;

    // Compute from/to boundaries (defaults to last 7 days)
    let fromDate;
    let toDate;

    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid from date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      fromDate.setHours(0, 0, 0, 0);
    } else {
      // Default to 7 days ago
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
      fromDate.setHours(0, 0, 0, 0);
    }

    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid to date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      toDate.setHours(23, 59, 59, 999);
    } else {
      // Default to today
      toDate = new Date();
      toDate.setHours(23, 59, 59, 999);
    }

    console.log(`[Reports] Generating content studio report for tenant ${tenantId} from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);

    // Generate report
    const report = await generateContentStudioActivityReport(tenantId, fromDate, toDate);

    res.json({
      ok: true,
      report,
    });
  } catch (error) {
    console.error('[Reports] Error generating content studio report:', error);
    next(error);
  }
});

/**
 * POST /api/admin/tenants/:tenantId/reports/campaign-performance
 * Generate a campaign performance report
 * 
 * Request body:
 *   - from?: string (ISO date string, defaults to 7 days ago)
 *   - to?: string (ISO date string, defaults to today)
 * 
 * Response:
 *   {
 *     ok: true,
 *     report: TenantReport
 *   }
 */
router.post('/admin/tenants/:tenantId/reports/campaign-performance', requireAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { from, to } = req.body;

    // Compute from/to boundaries (defaults to last 7 days)
    let fromDate;
    let toDate;

    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid from date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      fromDate.setHours(0, 0, 0, 0);
    } else {
      // Default to 7 days ago
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
      fromDate.setHours(0, 0, 0, 0);
    }

    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid to date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      toDate.setHours(23, 59, 59, 999);
    } else {
      // Default to today
      toDate = new Date();
      toDate.setHours(23, 59, 59, 999);
    }

    console.log(`[Reports] Generating campaign performance report for tenant ${tenantId} from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);

    // Generate report
    const report = await generateCampaignPerformanceReport(tenantId, fromDate, toDate);

    res.json({
      ok: true,
      report,
    });
  } catch (error) {
    console.error('[Reports] Error generating campaign performance report:', error);
    next(error);
  }
});

/**
 * POST /api/admin/tenants/:tenantId/reports/cai-usage
 * Generate a CAI usage report
 * 
 * Request body:
 *   - from?: string (ISO date string, defaults to 7 days ago)
 *   - to?: string (ISO date string, defaults to today)
 * 
 * Response:
 *   {
 *     ok: true,
 *     report: TenantReport
 *   }
 */
router.post('/admin/tenants/:tenantId/reports/cai-usage', requireAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { from, to } = req.body;

    let fromDate;
    let toDate;

    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid from date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      fromDate.setHours(0, 0, 0, 0);
    } else {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
      fromDate.setHours(0, 0, 0, 0);
    }

    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid to date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      toDate.setHours(23, 59, 59, 999);
    } else {
      toDate = new Date();
      toDate.setHours(23, 59, 59, 999);
    }

    console.log(`[Reports] Generating CAI usage report for tenant ${tenantId} from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);

    const report = await generateCaiUsageReport(tenantId, fromDate, toDate);

    res.json({
      ok: true,
      report,
    });
  } catch (error) {
    console.error('[Reports] Error generating CAI usage report:', error);
    next(error);
  }
});

/**
 * POST /api/admin/tenants/:tenantId/reports/device-health
 * Generate a device health report
 * 
 * Request body:
 *   - from?: string (ISO date string, defaults to 7 days ago)
 *   - to?: string (ISO date string, defaults to today)
 * 
 * Response:
 *   {
 *     ok: true,
 *     report: TenantReport
 *   }
 */
router.post('/admin/tenants/:tenantId/reports/device-health', requireAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { from, to } = req.body;

    let fromDate;
    let toDate;

    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid from date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      fromDate.setHours(0, 0, 0, 0);
    } else {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
      fromDate.setHours(0, 0, 0, 0);
    }

    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid to date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      toDate.setHours(23, 59, 59, 999);
    } else {
      toDate = new Date();
      toDate.setHours(23, 59, 59, 999);
    }

    console.log(`[Reports] Generating device health report for tenant ${tenantId} from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);

    const report = await generateDeviceHealthReport(tenantId, fromDate, toDate);

    res.json({
      ok: true,
      report,
    });
  } catch (error) {
    console.error('[Reports] Error generating device health report:', error);
    next(error);
  }
});

/**
 * POST /api/admin/tenants/:tenantId/reports/weekly-ai-summary
 * Generate a weekly AI assistant summary report
 * 
 * Request body:
 *   - from?: string (ISO date string, defaults to 7 days ago)
 *   - to?: string (ISO date string, defaults to today)
 * 
 * Response:
 *   {
 *     ok: true,
 *     report: TenantReport
 *   }
 * 
 * This endpoint generates an AI-powered summary of all reports from the specified period.
 * The summary includes an overview, highlights, risks, and recommended actions.
 */
router.post('/admin/tenants/:tenantId/reports/weekly-ai-summary', requireAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { from, to } = req.body;

    let fromDate;
    let toDate;

    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid from date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      fromDate.setHours(0, 0, 0, 0);
    } else {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
      fromDate.setHours(0, 0, 0, 0);
    }

    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Invalid to date format. Use ISO date string (YYYY-MM-DD)',
        });
      }
      toDate.setHours(23, 59, 59, 999);
    } else {
      toDate = new Date();
      toDate.setHours(23, 59, 59, 999);
    }

    console.log(`[Reports] Generating weekly AI summary for tenant ${tenantId} from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);

    const report = await generateWeeklyAiSummaryReport(tenantId, fromDate, toDate);

    res.json({
      ok: true,
      report,
    });
  } catch (error) {
    console.error('[Reports] Error generating weekly AI summary:', error);
    next(error);
  }
});

/**
 * Manual test commands (for development):
 * 
 * Daily device:
 *   irm -Method Post `
 *     -Uri "http://localhost:3001/api/admin/tenants/<tenantId>/reports/daily-device" `
 *     -Headers @{ "Content-Type"="application/json"; "Authorization"="Bearer dev-admin-token" } `
 *     -Body '{"date":"2025-12-05","deviceId":"<aRealDeviceId>"}'
 * 
 * Weekly tenant:
 *   irm -Method Post `
 *     -Uri "http://localhost:3001/api/admin/tenants/<tenantId>/reports/weekly" `
 *     -Headers @{ "Content-Type"="application/json"; "Authorization"="Bearer dev-admin-token" } `
 *     -Body '{"weekStart":"2025-12-01"}'
 * 
 * Content Studio:
 *   irm -Method Post `
 *     -Uri "http://localhost:3001/api/admin/tenants/<tenantId>/reports/content-studio" `
 *     -Headers @{ "Content-Type"="application/json"; "Authorization"="Bearer dev-admin-token" } `
 *     -Body '{"from":"2025-12-01","to":"2025-12-07"}'
 * 
 * Campaign Performance:
 *   irm -Method Post `
 *     -Uri "http://localhost:3001/api/admin/tenants/<tenantId>/reports/campaign-performance" `
 *     -Headers @{ "Content-Type"="application/json"; "Authorization"="Bearer dev-admin-token" } `
 *     -Body '{"from":"2025-12-01","to":"2025-12-07"}'
 * 
 * Weekly AI Summary:
 *   irm -Method Post `
 *     -Uri "http://localhost:3001/api/admin/tenants/<tenantId>/reports/weekly-ai-summary" `
 *     -Headers @{ "Content-Type"="application/json"; "Authorization"="Bearer dev-admin-token" } `
 *     -Body '{"from":"2025-12-01","to":"2025-12-07"}'
 * 
 * Verify in dashboard Insights → Reports that kinds show and filter correctly via the Kind dropdown.
 */

export default router;

