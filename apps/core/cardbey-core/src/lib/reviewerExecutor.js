/**
 * Reviewer Agent (v0): deterministic checklist on plan_update.
 * Only runs when ENABLE_REVIEWER=true. Blocks execution only if any HIGH issue exists;
 * MED/LOW are warnings (execution allowed, banner shown).
 * Trigger-scoped: uses triggerMessageId and OCR summary meta.triggerMessageId / context.businessProfileSource.
 */

import { getPrismaClient } from '../db/prisma.js';
import { inferExecutionSuggestions } from '../orchestrator/lib/inferExecutionSuggestions.js';

function normalizeLabel(label) {
  if (label == null || typeof label !== 'string') return '';
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Run v0 review checks on a plan message. Returns { status, summary, issues }.
 * Each issue has code, severity, message, suggestedFix.
 * Gating: status = 'changes_requested' only when any issue has severity === 'high'.
 *
 * @param {string} missionId
 * @param {string} planMessageId
 * @param {{ triggerMessageId?: string | null }} [opts] - trigger-scoped (e.g. run.input.triggerMessageId)
 * @returns {Promise<{ status: 'approved'|'changes_requested', summary: string, issues: Array<{code:string,severity:string,message:string,suggestedFix:string}> }>}
 */
export async function runReviewerInProcess(missionId, planMessageId, opts = {}) {
  const prisma = getPrismaClient();
  const issues = [];

  const planMsg = await prisma.agentMessage.findFirst({
    where: { id: planMessageId, missionId },
    select: { id: true, payload: true, content: true },
  });
  if (!planMsg || !planMsg.payload || typeof planMsg.payload !== 'object') {
    return {
      status: 'changes_requested',
      summary: 'Plan message not found or invalid.',
      issues: [
        {
          code: 'NO_PLAN',
          severity: 'high',
          message: 'Plan message not found or invalid.',
          suggestedFix: 'Post a new plan.',
        },
      ],
    };
  }

  const payload = planMsg.payload;
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { context: true },
  });
  const ctx = mission?.context && typeof mission.context === 'object' ? mission.context : {};
  const planText =
    planMsg.content && typeof planMsg.content === 'object' && planMsg.content.text
      ? String(planMsg.content.text)
      : '';

  // 1) Duplicate steps (normalized labels) -> HIGH blocker
  const seenNorm = new Set();
  for (const step of steps) {
    const label =
      step && typeof step === 'object' && step.label != null ? String(step.label) : (step && String(step)) || '';
    const norm = normalizeLabel(label) || 'step';
    if (seenNorm.has(norm)) {
      issues.push({
        code: 'DUPLICATE_STEP',
        severity: 'high',
        message: `Duplicate step (same as another): "${label.slice(0, 50)}${label.length > 50 ? '…' : ''}"`,
        suggestedFix: 'Remove or merge duplicate steps in the plan.',
      });
    } else {
      seenNorm.add(norm);
    }
  }

  // 2) Missing risk on steps (inferred suggestions must have valid risk)
  const inferredSuggestions = inferExecutionSuggestions(payload);
  const payloadSuggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
  const suggestions = payloadSuggestions.length > 0 ? payloadSuggestions : inferredSuggestions;
  for (const s of inferredSuggestions) {
    const risk = s && (s.risk === 'R0' || s.risk === 'R1' || s.risk === 'R2' || s.risk === 'R3') ? s.risk : null;
    if (!risk) {
      issues.push({
        code: 'MISSING_RISK',
        severity: 'high',
        message: `Step "${(s?.label || '').slice(0, 40)}…" has no valid risk (R0–R3).`,
        suggestedFix: 'Assign risk level (R0–R3) to each step in the plan.',
      });
    }
  }

  // 3) R3 tasks without approval gating -> HIGH blocker (check both inferred and payload.suggestions when present)
  const toCheckR3 = payloadSuggestions.length > 0 ? payloadSuggestions : inferredSuggestions;
  for (const s of toCheckR3) {
    const risk = s && typeof s === 'object' ? String(s.risk || '').toUpperCase() : '';
    const isR3 = risk === 'R3';
    const requiresApproval = s && typeof s === 'object' && s.requiresApproval === true;
    if (isR3 && !requiresApproval) {
      const label = (s && typeof s.label === 'string' ? s.label : '').slice(0, 40);
      issues.push({
        code: 'R3_WITHOUT_APPROVAL',
        severity: 'high',
        message: `R3 step "${label}${label.length >= 40 ? '…' : ''}" should require approval.`,
        suggestedFix: 'Ensure high-risk (R3) steps are gated by approval in the chain.',
      });
    }
  }

  // 4) Stale businessProfileSource: plan built for trigger A but context profile from trigger B
  const planTrigger = payload.triggerMessageId || opts.triggerMessageId;
  const profileSource = ctx.businessProfileSource && typeof ctx.businessProfileSource === 'object' ? ctx.businessProfileSource : null;
  const profileSourceTrigger = profileSource && typeof profileSource.triggerMessageId === 'string' ? profileSource.triggerMessageId.trim() : null;
  if (planTrigger && profileSourceTrigger && planTrigger !== profileSourceTrigger) {
    issues.push({
      code: 'STALE_BUSINESS_PROFILE_SOURCE',
      severity: 'high',
      message: 'Plan trigger does not match the business profile source (OCR/image). Profile may be from a different message.',
      suggestedFix: 'Re-run OCR from the same message that this plan is for, or revise the plan for the current context.',
    });
  }

  // 5) Missing deliverables: plan text mentions deliverables but payload has none
  const mentionsDeliverables = /\bdeliverable(s)?\b/i.test(planText);
  const payloadDeliverables = Array.isArray(payload.deliverables) ? payload.deliverables : [];
  if (mentionsDeliverables && payloadDeliverables.length === 0) {
    issues.push({
      code: 'MISSING_DELIVERABLES',
      severity: 'medium',
      message: 'Plan mentions deliverables but none are listed in the plan payload.',
      suggestedFix: 'Add a deliverables list to the plan or remove the reference.',
    });
  }

  // 6) Missing required context (budget/target/hero) if plan implies need
  const mentionsBudget = /\bbudget\b/i.test(planText) || /\b(weekly\s*)?spend\b/i.test(planText);
  const mentionsTarget = /\btarget\s*(customer|audience)\b/i.test(planText) || /\baudience\b/i.test(planText);
  const mentionsHero = /\bhero\s*product\b/i.test(planText) || /\bkey\s*product\b/i.test(planText);
  const hasBudget =
    ctx.budget != null ||
    ctx.budgetWeekly != null ||
    (typeof ctx.budget === 'string' && ctx.budget.trim() !== '') ||
    (typeof ctx.budgetWeekly === 'string' && ctx.budgetWeekly.trim() !== '');
  const hasTarget =
    ctx.targetCustomers != null ||
    ctx.targetAudience != null ||
    (typeof ctx.targetCustomers === 'string' && ctx.targetCustomers.trim() !== '');
  const hasHero =
    (Array.isArray(ctx.heroProducts) && ctx.heroProducts.length > 0) ||
    (typeof ctx.heroProducts === 'string' && ctx.heroProducts.trim() !== '');
  if (mentionsBudget && !hasBudget) {
    issues.push({
      code: 'MISSING_BUDGET',
      severity: 'high',
      message: 'Plan references budget but mission context has no budget set.',
      suggestedFix: 'Provide weekly budget in the checkpoint or context.',
    });
  }
  if (mentionsTarget && !hasTarget) {
    issues.push({
      code: 'MISSING_TARGET',
      severity: 'high',
      message: 'Plan references target customers/audience but context has none set.',
      suggestedFix: 'Provide target customers in the checkpoint or context.',
    });
  }
  if (mentionsHero && !hasHero) {
    issues.push({
      code: 'MISSING_HERO',
      severity: 'medium',
      message: 'Plan references hero products but context has none set.',
      suggestedFix: 'Provide hero products in the checkpoint or context.',
    });
  }

  // Gating: only HIGH issues block execution (LOCKED RULE)
  const hasHigh = issues.some((i) => i.severity === 'high');
  const status = hasHigh ? 'changes_requested' : 'approved';
  const summary =
    status === 'approved'
      ? issues.length === 0
        ? 'Plan passed review. No blocking issues.'
        : `Plan passed review with ${issues.length} non-blocking warning(s).`
      : `${issues.length} issue(s) found; ${issues.filter((i) => i.severity === 'high').length} blocking. Address them and revise the plan.`;

  return { status, summary, issues };
}
