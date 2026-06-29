/**
 * Single response builder for intake decision-loop outcomes.
 */

import { buildUploadGoalOptions } from '../decision/presentOptions.js';
import { isRegisteredTool } from '../intake/intakeToolRegistry.js';
import { buildStoreCreationDraft } from '../intake/storeCreationDraft.js';
import { formatStoreCreationDraftResponseForBundle } from '../intake/storeCreationDraftAssetBridge.js';

/**
 * @param {import('../decision/constants.js').BeliefSnapshot | null} belief
 * @returns {Array<{ label: string; tool: string; parameters: Record<string, unknown> }>}
 */
function getDefaultOptions(belief) {
  if (!belief) return [];
  return buildUploadGoalOptions(belief).options
    .map((opt) => {
      const label = String(opt.label ?? opt.id ?? '').trim();
      const tool = String(opt.tool ?? '').trim();
      if (!label || !tool || !isRegisteredTool(tool)) return null;
      return {
        label,
        tool,
        parameters:
          opt.parameters && typeof opt.parameters === 'object' && !Array.isArray(opt.parameters)
            ? opt.parameters
            : {},
      };
    })
    .filter(Boolean);
}

/**
 * @param {import('../decision/constants.js').BeliefSnapshot | null} belief
 */
function buildDraftFromBelief(belief) {
  const upload = belief?.lastUpload;
  const assetExtraction = upload
    ? {
        name: upload.businessName,
        businessName: upload.businessName,
        rawOcrText: upload.ocrText,
        source: 'upload_decision_loop',
        imageDataUrl: upload.imageRef,
      }
    : null;

  return buildStoreCreationDraft({
    userMessage: '',
    classification: {
      confidence: 0.85,
      parameters: {
        storeName: upload?.businessName ?? undefined,
        source: 'upload_decision_loop',
        imageDataUrl: upload?.imageRef ?? undefined,
      },
    },
    assetExtraction,
  });
}

/**
 * Map a TurnResult to the HTTP intake response envelope.
 *
 * @param {import('../decision/decideTurn.js').TurnResult} turnResult
 * @param {import('../decision/constants.js').BeliefSnapshot | null} [belief]
 * @param {Record<string, unknown>} [extras]
 */
export function buildIntakeResponse(turnResult, belief = null, extras = {}) {
  const missionId = belief?.anchors?.missionId ?? extras.missionId ?? null;

  switch (turnResult.nextStep) {
    case 'present_options': {
      const rawOptions = turnResult.options?.length ? turnResult.options : getDefaultOptions(belief);
      const options = (Array.isArray(rawOptions) ? rawOptions : [])
        .map((opt) => {
          if (!opt || typeof opt !== 'object') return null;
          const label = String(opt.label ?? opt.id ?? '').trim();
          const tool = String(opt.tool ?? turnResult.tool?.name ?? '').trim();
          if (!label || !tool || !isRegisteredTool(tool)) return null;
          return {
            label,
            tool,
            parameters:
              opt.parameters && typeof opt.parameters === 'object' && !Array.isArray(opt.parameters)
                ? opt.parameters
                : {},
          };
        })
        .filter(Boolean);

      return {
        success: true,
        action: 'clarify',
        response: turnResult.rationale || 'What would you like to do with this card?',
        ...(options.length > 0 ? { options } : {}),
        storeCreationDraft: null,
      };
    }

    case 'execute': {
      if (turnResult.tool?.name === 'create_store' && belief?.lastUpload) {
        const bundle = buildDraftFromBelief(belief);
        return {
          success: true,
          action: 'create_store',
          intentMode: bundle.intentMode,
          storeCreationDraft: bundle,
          missingFields: bundle.missingFields ?? [],
          response: formatStoreCreationDraftResponseForBundle(bundle, {
            source: bundle.draft?.source,
          }),
          ...(missionId ? { missionId } : {}),
        };
      }

      return {
        success: true,
        action: 'execute',
        tool: turnResult.tool?.name ?? null,
        parameters: turnResult.tool?.parameters ?? {},
        ...(missionId ? { missionId } : {}),
      };
    }

    case 'checkpoint':
      return {
        success: true,
        action: 'proactive_plan',
        response: `Please confirm before proceeding: ${turnResult.governance?.proposedAction ?? turnResult.rationale ?? 'this action'}`,
        plan: turnResult.tool?.parameters?.plan ?? null,
        requiresConfirmation: true,
        ...(missionId ? { missionId } : {}),
      };

    case 'guide_auth':
      return {
        success: true,
        action: 'auth_required',
        response: 'Please sign in to continue.',
        returnTo: turnResult.belief?.sessionKey ?? null,
      };

    case 'clarify': {
      const rawOptions = turnResult.options?.length ? turnResult.options : getDefaultOptions(belief);
      const options = (Array.isArray(rawOptions) ? rawOptions : [])
        .map((opt) => {
          if (!opt || typeof opt !== 'object') return null;
          const label = String(opt.label ?? opt.id ?? '').trim();
          const tool = String(opt.tool ?? turnResult.tool?.name ?? '').trim();
          if (!label || !tool || !isRegisteredTool(tool)) return null;
          return {
            label,
            tool,
            parameters:
              opt.parameters && typeof opt.parameters === 'object' && !Array.isArray(opt.parameters)
                ? opt.parameters
                : {},
          };
        })
        .filter(Boolean);

      const usedUploadDefaultOptions =
        !(turnResult.options?.length) &&
        options.some(
          (o) =>
            o.tool === 'create_store' &&
            o.parameters &&
            typeof o.parameters === 'object' &&
            o.parameters.source === 'upload_ask_selection',
        );
      const uploadQuestion =
        usedUploadDefaultOptions || turnResult.nextStep === 'present_options'
          ? buildUploadGoalOptions(belief).question
          : null;

      return {
        success: true,
        action: 'clarify',
        response: uploadQuestion ?? (turnResult.rationale || 'How can I help?'),
        ...(options.length > 0 ? { options } : {}),
        storeCreationDraft: null,
      };
    }

    default:
      return {
        success: true,
        action: 'chat',
        response: turnResult.rationale || 'How can I help?',
      };
  }
}

/**
 * Upload-ask panel from belief alone (Rule 1 fallback).
 * @param {import('../decision/constants.js').BeliefSnapshot} belief
 */
export function buildUploadAskResponseFromBelief(belief) {
  const turnResult = {
    nextStep: 'present_options',
    rationale: buildUploadGoalOptions(belief).question,
    options: buildUploadGoalOptions(belief).options,
    tool: null,
    governance: {},
    belief,
  };
  return buildIntakeResponse(turnResult, belief);
}
