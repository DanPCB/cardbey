/**
 * Phase 3 — plain-English decision explanations.
 */

import type { BuildDecisionRecordInput, DecisionRecord } from './decisionRecord.types.js';
import { isCampaignTool, isLoyaltyTool } from './toolFamily.js';

type ExplanationInput = Pick<
  BuildDecisionRecordInput,
  'userText' | 'performerTool' | 'intentReasonerTool' | 'kernelAlternatives' | 'agreement' | 'tags'
> & {
  disagreementReason?: DecisionRecord['calibration']['disagreementReason'];
  topLabel?: string | null;
  kernelTopTool?: string | null;
};

export function buildDecisionExplanation(input: ExplanationInput): string {
  const agreement = input.agreement;
  const performerTool = String(input.performerTool ?? '').trim();
  const kernelTop = input.kernelAlternatives?.[0] ?? null;
  const kernelTopTool = String(input.kernelTopTool ?? kernelTop?.toolHint ?? '').trim();
  const topLabel = input.topLabel ?? kernelTop?.label ?? kernelTopTool;
  const tags = input.tags ?? [];
  const userText = String(input.userText ?? '').trim();

  if (agreement === 'top1') {
    if (isLoyaltyTool(performerTool) && isLoyaltyTool(kernelTopTool)) {
      return 'Kernel and Performer both selected loyalty because the uploaded asset looked like a stamp card and the signals pointed to a reward program.';
    }
    if (isCampaignTool(performerTool) && isCampaignTool(kernelTopTool)) {
      return 'Kernel and Performer both selected a marketing campaign path based on promotional cues in the upload or user wording.';
    }
    return `Kernel and Performer agreed on ${topLabel || performerTool || 'the same mission path'}.`;
  }

  if (agreement === 'top3') {
    return `Performer selected ${performerTool || 'a tool'} which appeared among Kernel's top alternatives, though not as rank 1 (${topLabel || kernelTopTool}).`;
  }

  if (agreement === 'no_kernel_run') {
    return 'No Kernel cognitive run was available for this intake, so calibration compared Performer only.';
  }

  const reason = input.disagreementReason;

  if (reason === 'rule_conflict' || tags.includes('campaign_vs_loyalty')) {
    return `Performer selected ${performerTool || 'one path'}, but Kernel ranked ${topLabel || kernelTopTool || 'another path'} higher. Attachment evidence and routing rules conflicted (campaign vs loyalty). This should be clarified before future authority switching.`;
  }

  if (reason === 'explicit_user_wording') {
    return `Performer selected ${performerTool || 'one path'} while Kernel favored ${topLabel || kernelTopTool || 'another path'}. User wording${userText ? ` ("${userText.slice(0, 80)}")` : ''} conflicted with attachment-driven inference.`;
  }

  if (reason === 'runtime_override') {
    return `Performer overrode the initial classifier (${input.intentReasonerTool || 'unknown'}) to route ${performerTool || 'a different tool'} instead of Kernel's top choice ${topLabel || kernelTopTool || ''}.`;
  }

  if (reason === 'ocr_ambiguity') {
    return 'OCR was weak or unreadable, so Performer and Kernel may have weighted visual vs text cues differently.';
  }

  if (reason === 'vision_ambiguity' || tags.includes('attachment_hijack')) {
    return 'Visual attachment signals were ambiguous; Performer applied a routing override that Kernel did not rank first.';
  }

  if (reason === 'missing_context') {
    return 'Missing store or session context may have caused Performer and Kernel to diverge.';
  }

  if (reason === 'clarification_required') {
    return 'Kernel had low confidence and multiple close alternatives, so the request should be treated as ambiguous.';
  }

  return `Performer selected ${performerTool || 'unknown'} while Kernel's top alternative was ${topLabel || kernelTopTool || 'unknown'}. Reason not fully classified yet.`;
}
