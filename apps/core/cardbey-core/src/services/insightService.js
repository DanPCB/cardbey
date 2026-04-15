/**
 * Insight Service
 * 
 * Generates AI-powered insight cards from tenant reports.
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { chunkText } from './ragChunkUtils.js';
import {
  buildInsightAction,
  inferEntryPointFromInsight,
  buildPayloadForEntryPoint,
  isInsightInputErrorLike,
  parseDeviceIdFromReportTags,
} from '../utils/insightActionBuilder.js';

const prisma = new PrismaClient();

// Initialize OpenAI client (reuse same pattern as reportService)
if (!process.env.OPENAI_API_KEY) {
  console.warn('[Insight Service] WARNING: OPENAI_API_KEY not configured. Insight generation will not work.');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000, // 30 second timeout
      maxRetries: 2,
    })
  : null;

const HAS_OPENAI = Boolean(openai);

/**
 * @param {Object} report
 * @returns {string|null}
 */
function resolveDeviceIdForReport(report) {
  if (!report || typeof report !== 'object') return null;
  const direct = report.deviceId;
  if (direct != null && String(direct).trim()) return String(direct).trim();
  return parseDeviceIdFromReportTags(report.tags);
}

/**
 * Insight Generation System Prompt
 */
const INSIGHT_SYSTEM_PROMPT = `You are Cardbey Insights, an AI assistant that distills Cardbey marketing and device reports into concise insight cards for store owners.

Your task is to analyze a report and generate 1-3 actionable insight cards. Each insight should be:
- Clear and actionable
- Focused on what matters most to the business owner
- Categorized by severity: 'info' (informational), 'warning' (needs attention), or 'opportunity' (growth potential)

Return ONLY a raw JSON array, no code fences, no markdown, no explanations. The JSON should be valid and parseable directly.`;

/**
 * Generate insights for a report
 * 
 * @param {Object} report - Report object with id, tenantId, kind, periodKey, contentMd
 * @returns {Promise<Array>} Array of created insight records
 */
export async function generateInsightsForReport(report) {
  if (!report) {
    console.warn('[InsightService] No report provided for insight generation');
    return [];
  }

  const { id, tenantId, kind, periodKey, contentMd } = report;

  if (!contentMd || contentMd.trim().length < 100) {
    console.log(`[InsightService] Skipping insight generation for report ${id}: content too short or missing`);
    return [];
  }

  if (!HAS_OPENAI) {
    console.warn('[InsightService] OpenAI not configured, skipping insight generation');
    return [];
  }

  try {
    // Truncate content to max 4000 chars to avoid token limits
    const truncatedContent = contentMd.length > 4000
      ? contentMd.substring(0, 4000) + '...'
      : contentMd;

    const userPrompt = `Analyze this ${kind} report for period ${periodKey} and generate 1-3 concise insight cards.

Report content:
${truncatedContent}

Return a JSON array with objects having these exact fields:
- title: string (short, actionable title)
- severity: string (one of: 'info', 'warning', 'opportunity')
- tags: string (comma-separated tags like 'device,risk' or 'campaign,performance')
- summaryMd: string (2-5 bullet points or short paragraphs in markdown format)

Return ONLY raw JSON, no code fences, no explanations. Example format:
[{"title":"Device Uptime Below Target","severity":"warning","tags":"device,uptime","summaryMd":"- Device uptime is 85%, below the 95% target\\n- 3 devices showed repeated errors this week"},{"title":"Campaign Performance Strong","severity":"opportunity","tags":"campaign,growth","summaryMd":"- Top campaign generated 500+ impressions\\n- Consider increasing budget for similar campaigns"}]

Generate insights now:`;

    console.log(`[InsightService] Generating insights for report ${id} (${kind}, ${periodKey})`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INSIGHT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const responseText = completion.choices[0]?.message?.content || '';
    
    if (!responseText) {
      console.warn(`[InsightService] Empty response from OpenAI for report ${id}`);
      return [];
    }

    // Parse JSON response
    // OpenAI might return JSON wrapped in code fences or as a JSON object
    let insightsData;
    try {
      // Try to extract JSON from markdown code fences if present
      const jsonMatch = responseText.match(/```(?:json)?\s*(\[.*?\])\s*```/s);
      if (jsonMatch) {
        insightsData = JSON.parse(jsonMatch[1]);
      } else {
        // Try parsing as direct JSON
        const parsed = JSON.parse(responseText);
        // If it's an object with an 'insights' key, extract that
        if (parsed.insights && Array.isArray(parsed.insights)) {
          insightsData = parsed.insights;
        } else if (Array.isArray(parsed)) {
          insightsData = parsed;
        } else {
          // If it's a single object, wrap it in an array
          insightsData = [parsed];
        }
      }
    } catch (parseError) {
      console.error(`[InsightService] Failed to parse JSON response for report ${id}:`, parseError);
      console.error(`[InsightService] Response text:`, responseText.substring(0, 500));
      return [];
    }

    if (!Array.isArray(insightsData) || insightsData.length === 0) {
      console.warn(`[InsightService] No insights generated for report ${id}`);
      return [];
    }

    // Validate and create insights (limit to 3)
    const insightsToCreate = insightsData.slice(0, 3).filter((insight) => {
      return (
        insight.title &&
        typeof insight.title === 'string' &&
        ['info', 'warning', 'opportunity'].includes(insight.severity) &&
        insight.summaryMd &&
        typeof insight.summaryMd === 'string'
      );
    });

    if (insightsToCreate.length === 0) {
      console.warn(`[InsightService] No valid insights after validation for report ${id}`);
      return [];
    }

    const reportDeviceId = resolveDeviceIdForReport(report);

    // Create insight records with actions
    const createdInsights = [];
    for (const insightData of insightsToCreate) {
      try {
        const title = insightData.title.trim();
        const summaryMd = insightData.summaryMd.trim();
        const tags = insightData.tags?.trim() || null;

        // Infer entry point from insight content (device_maintenance_plan only when device-scoped)
        const entryPoint = inferEntryPointFromInsight(tags, kind, title, summaryMd, {
          deviceId: reportDeviceId || undefined,
        });

        // Build action if entry point was inferred
        let action = null;
        if (entryPoint) {
          try {
            if (
              entryPoint === 'device_maintenance_plan' &&
              (!reportDeviceId || !String(reportDeviceId).trim())
            ) {
              console.warn(
                '[InsightService] insight_action_skipped',
                JSON.stringify({
                  event: 'insight_action_skipped',
                  code: 'INSIGHT_INPUT_ERROR',
                  entryPoint: 'device_maintenance_plan',
                  missingField: 'deviceId',
                  reason: 'pre_validation_missing_device_id',
                  reportId: id,
                  kind,
                }),
              );
            } else {
              const payload = buildPayloadForEntryPoint(entryPoint, tenantId, {
                kind,
                reportId: id,
                deviceId: reportDeviceId || undefined,
                storeId: report.storeId || undefined,
              });

              // Generate action description from title
              const actionDescription = title.toLowerCase().includes("check")
                ? `Run ${title}`
                : title.toLowerCase().includes("review")
                ? `Review ${title}`
                : title.toLowerCase().includes("setup") || title.toLowerCase().includes("configure")
                ? `Configure ${title}`
                : `Take action: ${title}`;

              action = buildInsightAction({
                description: actionDescription,
                entryPoint,
                payload,
                source: "insight_card",
                priority: insightData.severity === "warning" ? "primary" : "secondary",
              });
            }
          } catch (payloadErr) {
            if (isInsightInputErrorLike(payloadErr)) {
              console.warn(
                '[InsightService] insight_action_skipped',
                JSON.stringify({
                  event: 'insight_action_skipped',
                  code: payloadErr.code,
                  entryPoint: payloadErr.entryPoint,
                  missingField: payloadErr.missingField,
                  reason: payloadErr.reason,
                  reportId: id,
                  kind,
                }),
              );
            } else {
              throw payloadErr;
            }
          }
        }

        const insight = await prisma.tenantInsight.create({
          data: {
            tenantId,
            reportId: id,
            kind,
            severity: insightData.severity,
            title,
            summaryMd,
            tags,
            periodKey,
          },
        });

        // Attach action to insight object (action is computed, not stored in DB)
        // The action will be re-computed when insights are returned via API
        createdInsights.push(insight);
        
        // Optionally ingest insight into RAG (non-blocking)
        indexInsightToRag(insight).catch((ragError) => {
          console.warn(`[InsightService] Failed to index insight ${insight.id} to RAG:`, ragError.message);
        });
      } catch (error) {
        console.error(`[InsightService] Error creating insight for report ${id}:`, error);
        // Continue with other insights
      }
    }

    console.log(`[InsightService] Generated ${createdInsights.length} insights for report ${id}`);
    return createdInsights;
  } catch (error) {
    console.error(`[InsightService] Failed to generate insights for report ${id}:`, error.message);
    // Don't throw - insight generation should not break report creation
    return [];
  }
}

/**
 * Index a single insight into RAG
 * 
 * @param {Object} insight - TenantInsight object
 * @returns {Promise<void>}
 */
async function indexInsightToRag(insight) {
  if (!HAS_OPENAI) {
    return; // Skip if OpenAI not configured
  }

  const { id, tenantId, title, summaryMd } = insight;

  if (!summaryMd || summaryMd.trim().length === 0) {
    return; // Skip empty insights
  }

  try {
    // Build text to chunk: title + summary
    const textToChunk = `# ${title}\n\n${summaryMd}`;

    // Chunk the text
    const chunks = chunkText(textToChunk, 500, 80);

    if (chunks.length === 0) {
      return;
    }

    // Use scope: tenant_insights
    const scope = 'tenant_insights';
    const sourcePath = `insight/${id}`;

    // Delete existing chunks for this insight (if re-indexing)
    await prisma.ragChunk.deleteMany({
      where: {
        sourcePath,
      },
    });

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        // Generate embedding
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: chunk,
        });

        const embedding = response.data[0]?.embedding;
        if (!embedding) {
          continue;
        }

        const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

        // Upsert chunk
        await prisma.ragChunk.upsert({
          where: {
            sourcePath_chunkIndex: {
              sourcePath,
              chunkIndex: i,
            },
          },
          update: {
            scope,
            content: chunk,
            embedding: embeddingBuffer,
            tenantId,
            updatedAt: new Date(),
          },
          create: {
            scope,
            sourcePath,
            chunkIndex: i,
            content: chunk,
            embedding: embeddingBuffer,
            tenantId,
          },
        });
      } catch (error) {
        console.warn(`[InsightService] Error indexing chunk ${i} of insight ${id}:`, error.message);
        // Continue with other chunks
      }
    }

    console.log(`[InsightService] Indexed insight ${id} into RAG (${chunks.length} chunks)`);
  } catch (error) {
    console.warn(`[InsightService] Error indexing insight ${id} to RAG:`, error.message);
    // Don't throw - RAG indexing is optional
  }
}
