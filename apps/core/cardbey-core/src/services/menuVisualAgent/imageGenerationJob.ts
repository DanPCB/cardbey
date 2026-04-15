/**
 * Image Generation Job Queue
 * Manages async jobs for menu image generation
 * 
 * Uses existing OrchestratorTask model to avoid schema changes
 */

import { PrismaClient } from '@prisma/client';
import { generateImagesForMenu } from './menuVisualAgent.js';

const prisma = new PrismaClient();

const JOB_ENTRY_POINT = 'menu_visual_generation';

/**
 * Queue an image generation job
 * Creates an OrchestratorTask record with status "queued"
 * 
 * @param storeId - Store/Business ID
 * @param itemIds - Optional array of product IDs. If undefined, processes all items without images
 * @param tenantId - Tenant/User ID (for OrchestratorTask)
 * @param userId - User ID (for OrchestratorTask)
 * @returns Task ID
 */
export async function queueImageGenerationJob(
  storeId: string,
  itemIds?: string[],
  tenantId?: string,
  userId?: string
): Promise<string> {
  try {
    // If tenantId/userId not provided, try to get from business
    let resolvedTenantId = tenantId;
    let resolvedUserId = userId;

    if (!resolvedTenantId || !resolvedUserId) {
      const business = await prisma.business.findUnique({
        where: { id: storeId },
        select: { userId: true },
      });

      if (business) {
        resolvedUserId = business.userId;
        resolvedTenantId = business.userId; // Use userId as tenantId for single-tenant
      }
    }

    // Create orchestrator task
    const task = await prisma.orchestratorTask.create({
      data: {
        entryPoint: JOB_ENTRY_POINT,
        tenantId: resolvedTenantId || storeId, // Fallback to storeId if no tenantId
        userId: resolvedUserId || storeId, // Fallback to storeId if no userId
        status: 'queued',
        request: {
          storeId,
          itemIds: itemIds || null, // null means "all items without images"
        },
      },
    });

    console.log(`[ImageGenerationJob] Queued job ${task.id} for store ${storeId}`);
    return task.id;
  } catch (error: any) {
    console.error('[ImageGenerationJob] Failed to queue job:', error);
    throw error;
  }
}

/**
 * Process queued image generation jobs
 * Called by worker process every 30 seconds
 * 
 * @param limit - Maximum number of jobs to process per run (default: 5)
 * @returns Number of jobs processed
 */
export async function processImageGenerationJobs(limit: number = 5): Promise<number> {
  try {
    // Find queued jobs
    const queuedJobs = await prisma.orchestratorTask.findMany({
      where: {
        entryPoint: JOB_ENTRY_POINT,
        status: 'queued',
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    if (queuedJobs.length === 0) {
      return 0;
    }

    console.log(`[ImageGenerationJob] Processing ${queuedJobs.length} queued jobs`);

    let processed = 0;

    // Process each job
    for (const job of queuedJobs) {
      try {
        // Update status to running
        await prisma.orchestratorTask.update({
          where: { id: job.id },
          data: { status: 'running' },
        });

        // Extract job parameters
        const request = job.request as any;
        const storeId = request.storeId;
        const itemIds = request.itemIds || undefined;

        if (!storeId) {
          throw new Error('Missing storeId in job request');
        }

        // Execute image generation
        const result = await generateImagesForMenu(storeId, itemIds);

        // Update job status to completed
        await prisma.orchestratorTask.update({
          where: { id: job.id },
          data: {
            status: 'completed',
            result: result,
          },
        });

        processed++;
        console.log(`[ImageGenerationJob] ✅ Completed job ${job.id} for store ${storeId}`);
      } catch (jobError: any) {
        // Update job status to failed
        await prisma.orchestratorTask.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            result: {
              error: jobError.message || 'Unknown error',
            },
          },
        });

        console.error(`[ImageGenerationJob] ❌ Failed job ${job.id}:`, jobError.message);
      }
    }

    return processed;
  } catch (error: any) {
    console.error('[ImageGenerationJob] Fatal error processing jobs:', error);
    return 0;
  }
}

/**
 * Get job status
 * 
 * @param taskId - Task ID
 * @returns Job status and result
 */
export async function getJobStatus(taskId: string) {
  const task = await prisma.orchestratorTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      result: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return task;
}

