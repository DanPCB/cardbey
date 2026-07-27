/**
 * Extract context updates from various system events.
 */

import { generateContextId } from './contextUtils.js';
import {
  extractCampaignIdFromMission,
  extractStoreIdFromMission,
} from './contextMissionExtract.js';

/**
 * @typedef {import('./contextTypes.ts').UserContext} UserContext
 * @typedef {import('./contextTypes.ts').ContextUpdate} ContextUpdate
 * @typedef {import('./contextTypes.ts').WorkflowType} WorkflowType
 */

const INTENT_WORKFLOW_MAP = {
  create_store: 'store_creation',
  create_campaign: 'campaign_creation',
  generate_graphic: 'graphic_generation',
  add_product: 'product_management',
  replace_store_catalog: 'catalog_creation',
  launch_campaign: 'campaign_creation',
  create_promotion: 'promotion_creation',
};

const MISSION_TYPE_WORKFLOW_MAP = {
  store: 'store_creation',
  store_creation: 'store_creation',
  campaign: 'campaign_creation',
  campaign_creation: 'campaign_creation',
  graphic: 'graphic_generation',
  graphic_generation: 'graphic_generation',
};

function workflowFromIntent(intentType) {
  if (!intentType) return null;
  const key = String(intentType).trim();
  return /** @type {WorkflowType | null} */ (INTENT_WORKFLOW_MAP[key] ?? null);
}

export class ContextExtractor {
  /**
   * @param {Record<string, unknown>} input
   * @param {UserContext | null} currentContext
   * @returns {ContextUpdate}
   */
  extractFromIntake(input, currentContext) {
    /** @type {ContextUpdate} */
    const update = {};

    const clientContext =
      input.currentContext && typeof input.currentContext === 'object' && !Array.isArray(input.currentContext)
        ? /** @type {Record<string, unknown>} */ (input.currentContext)
        : {};
    const selection =
      input.intakeV2Selection && typeof input.intakeV2Selection === 'object' && !Array.isArray(input.intakeV2Selection)
        ? /** @type {Record<string, unknown>} */ (input.intakeV2Selection)
        : null;
    const selectionParams =
      selection?.selectedParameters && typeof selection.selectedParameters === 'object'
        ? /** @type {Record<string, unknown>} */ (selection.selectedParameters)
        : {};

    const intentType =
      (input.intent && typeof input.intent === 'object'
        ? String(/** @type {Record<string, unknown>} */ (input.intent).type ?? '')
        : '') ||
      String(input.tool ?? input.intentType ?? '').trim();

    const workflow = workflowFromIntent(intentType);
    if (workflow) {
      update.currentWorkflow = workflow;
    } else if (currentContext?.currentWorkflow) {
      update.currentWorkflow = currentContext.currentWorkflow;
    }

    const text = String(input.text ?? input.userMessage ?? input.message ?? '').trim();
    const attachments = Array.isArray(input.attachments) ? input.attachments : [];
    const hasImage = Boolean(input.imageDataUrl || input.image);

    if (attachments.length > 0 || hasImage) {
      update.currentInputContext = {
        rawText: text,
        hasAttachment: true,
        hasImage,
        attachmentTypes: attachments
          .map((a) =>
            a && typeof a === 'object' ? String(/** @type {Record<string, unknown>} */ (a).mimeType ?? '') : '',
          )
          .filter(Boolean),
        extractedText: typeof input.extractedText === 'string' ? input.extractedText : null,
        detectedType: typeof input.detectedType === 'string' ? input.detectedType : null,
      };
    } else if (text) {
      update.currentInputContext = {
        rawText: text,
        hasAttachment: false,
        hasImage: false,
        attachmentTypes: [],
        extractedText: null,
        detectedType: null,
      };
    }

    if (input.missionId) {
      update.activeMissionId = String(input.missionId);
    }

    const storeFromSelection = selectionParams.storeId ?? selectionParams.activeStoreId;
    const storeFromClient = clientContext.activeStoreId ?? clientContext.storeId;
    const storeFromInput = input.storeId ?? input.activeStoreId;
    const resolvedStoreId = storeFromSelection ?? storeFromClient ?? storeFromInput;
    if (resolvedStoreId) {
      update.activeStoreId = String(resolvedStoreId);
    }

    return update;
  }

  /**
   * @param {Record<string, unknown>} mission
   * @param {UserContext | null} currentContext
   * @returns {ContextUpdate}
   */
  extractFromMission(mission, currentContext) {
    /** @type {ContextUpdate} */
    const update = {};

    if (mission.id) update.activeMissionId = String(mission.id);
    if (mission.currentStepId) update.currentStepId = String(mission.currentStepId);

    const missionType = String(mission.type ?? '').trim();
    const workflow =
      /** @type {WorkflowType | null} */ (MISSION_TYPE_WORKFLOW_MAP[missionType] ?? null) ||
      workflowFromIntent(missionType);
    if (workflow) update.currentWorkflow = workflow;

    const meta =
      mission.metadata && typeof mission.metadata === 'object'
        ? /** @type {Record<string, unknown>} */ (mission.metadata)
        : mission.metadataJson && typeof mission.metadataJson === 'object'
          ? /** @type {Record<string, unknown>} */ (mission.metadataJson)
          : {};

    if (meta.storeId) update.activeStoreId = String(meta.storeId);
    if (meta.campaignId) update.activeCampaignId = String(meta.campaignId);

    if (!update.activeStoreId && mission.targetId && (missionType === 'store' || mission.targetType === 'store')) {
      const tid = String(mission.targetId).trim();
      if (tid && tid !== 'temp') update.activeStoreId = tid;
    }

    if (String(mission.status ?? '').toLowerCase() === 'completed') {
      const storeId = extractStoreIdFromMission(
        {
          targetId: mission.targetId,
          targetType: mission.targetType,
          type: mission.type,
          metadataJson: mission.metadataJson ?? mission.metadata,
          outputsJson: mission.outputsJson ?? mission.pipeline?.outputsJson,
        },
        mission.result && typeof mission.result === 'object'
          ? /** @type {Record<string, unknown>} */ (mission.result)
          : {},
      );
      const campaignId = extractCampaignIdFromMission(
        {
          targetId: mission.targetId,
          targetType: mission.targetType,
          metadataJson: mission.metadataJson ?? mission.metadata,
          outputsJson: mission.outputsJson ?? mission.pipeline?.outputsJson,
        },
        mission.result && typeof mission.result === 'object'
          ? /** @type {Record<string, unknown>} */ (mission.result)
          : {},
      );

      if (storeId) update.activeStoreId = storeId;
      if (campaignId) update.activeCampaignId = campaignId;
      update.activeMissionId = null;
      update.currentStepId = null;
      update.pendingCheckpoints = [];
      update.currentWorkflow = null;
    }

    void currentContext;
    return update;
  }

  /**
   * @param {Record<string, unknown>} result
   * @param {UserContext | null} currentContext
   * @returns {ContextUpdate}
   */
  extractFromToolExecution(result, currentContext) {
    /** @type {ContextUpdate} */
    const update = {};
    const tool = String(result.tool ?? '').trim();
    const success = result.success === true;
    const payload = result.result && typeof result.result === 'object' ? /** @type {Record<string, unknown>} */ (result.result) : {};

    const isStoreTool =
      tool === 'create_store' || tool === 'store' || tool === 'store_creation' || tool === 'structured_store_build';
    if (isStoreTool && success) {
      const storeId =
        result.storeId ||
        payload.storeId ||
        payload.businessId ||
        payload.committedStoreId;
      if (storeId) update.activeStoreId = String(storeId);
      update.completedActions = [
        {
          id: generateContextId(),
          timestamp: new Date().toISOString(),
          type: 'store_created',
          tool: 'create_store',
          result: result.result,
          success: true,
        },
        ...(currentContext?.completedActions ?? []),
      ].slice(0, 50);
      update.currentWorkflow = 'store_creation';
    }

    const isCampaignTool = tool === 'create_campaign' || tool === 'campaign' || tool === 'campaign_creation';
    if (isCampaignTool && success) {
      if (payload.campaignId) update.activeCampaignId = String(payload.campaignId);
      update.completedActions = [
        {
          id: generateContextId(),
          timestamp: new Date().toISOString(),
          type: 'campaign_created',
          tool: 'create_campaign',
          result: result.result,
          success: true,
        },
        ...(currentContext?.completedActions ?? []),
      ].slice(0, 50);
      update.currentWorkflow = 'campaign_creation';
    }

    return update;
  }

  /**
   * @param {Record<string, unknown>} feedback
   * @param {UserContext | null} currentContext
   * @returns {ContextUpdate}
   */
  extractFromUserFeedback(feedback, currentContext) {
    /** @type {ContextUpdate} */
    const update = {};
    const feedbackType = String(feedback.type ?? '').trim();

    if (feedbackType === 'skipped_step' && feedback.stepId) {
      const skippedSteps = [...(currentContext?.preferences?.skippedSteps ?? [])];
      const stepId = String(feedback.stepId);
      if (!skippedSteps.includes(stepId)) {
        skippedSteps.push(stepId);
        update.preferences = {
          ...(currentContext?.preferences ?? {
            preferredWorkflowOrder: [],
            skippedSteps: [],
            language: 'en',
            notificationPreferences: {},
            defaultAction: null,
            frequentlyUsedTools: [],
          }),
          skippedSteps,
        };
      }
    }

    if (feedbackType === 'tool_used' && feedback.tool) {
      const tool = String(feedback.tool);
      const tools = currentContext?.preferences?.frequentlyUsedTools ?? [];
      const updatedTools = [tool, ...tools.filter((t) => t !== tool)].slice(0, 10);
      update.preferences = {
        ...(currentContext?.preferences ?? {
          preferredWorkflowOrder: [],
          skippedSteps: [],
          language: 'en',
          notificationPreferences: {},
          defaultAction: null,
          frequentlyUsedTools: [],
        }),
        frequentlyUsedTools: updatedTools,
      };
    }

    if (feedbackType === 'correction' && feedback.pattern) {
      const patterns = [...(currentContext?.behaviorPatterns ?? [])];
      const patternKey = String(feedback.pattern);
      const existing = patterns.find((p) => p.pattern === patternKey);
      if (existing) {
        existing.frequency += 1;
        existing.lastObserved = new Date().toISOString();
      } else {
        patterns.push({
          pattern: patternKey,
          frequency: 1,
          lastObserved: new Date().toISOString(),
          confidence: 0.5,
        });
      }
      update.behaviorPatterns = patterns;
    }

    return update;
  }
}

export const contextExtractor = new ContextExtractor();
