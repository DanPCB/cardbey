/**
 * Plan preview & approval — shared constants for skill runtime pause/resume.
 */

export const SKILL_STATUS_AWAITING_PLAN_APPROVAL = 'awaiting_plan_approval';

export const PENDING_SKILL_PLAN_APPROVAL = 'planApproval';

export const BLACKBOARD_KEY_PLAN_PENDING = 'plan_approval:pending';

export const BLACKBOARD_KEY_PLAN_DECIDED = 'plan_approval:decided';

export const PLAN_EVENT_READY = 'skill:plan_ready';

export const PLAN_EVENT_DECIDED = 'skill:plan_approval_decided';

export const VIDEO_PLAN_SCHEMA = 'video_plan_v1';

/** User phrases that may skip preview for non-expensive skills only. */
export const SKIP_PLAN_PREVIEW_PATTERN = /\b(just do it|skip preview|no preview|generate now|without preview)\b/i;
