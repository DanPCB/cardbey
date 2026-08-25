/**
 * Investor engagement tracking (Phase 1H).
 * Manual-event ledger on MarketingCampaign — not a fundraising CRM.
 * INVESTOR_HANDOFF is readiness. CONTACTED is only an explicit human record.
 */

import { EVIDENCE_KIND } from './researchContract.js';
import { INVESTOR_HANDOFF_STATES } from './investorEngagementContract.js';

export const INVESTOR_TRACKING_KIND = 'INVESTOR_ENGAGEMENT_TRACKING_V1';

export const INVESTOR_LIFECYCLE = Object.freeze({
  RESEARCHING: 'RESEARCHING',
  QUALIFIED: 'QUALIFIED',
  PROPOSAL_READY: 'PROPOSAL_READY',
  HANDOFF_APPROVED: 'HANDOFF_APPROVED',
  CONTACTED: 'CONTACTED',
  REPLIED: 'REPLIED',
  MEETING_SCHEDULED: 'MEETING_SCHEDULED',
  MEETING_COMPLETED: 'MEETING_COMPLETED',
  FOLLOW_UP: 'FOLLOW_UP',
  DILIGENCE: 'DILIGENCE',
  PASSED: 'PASSED',
  TERM_SHEET: 'TERM_SHEET',
  INVESTED: 'INVESTED',
  CLOSED: 'CLOSED',
});

export const INVESTOR_ENGAGEMENT_EVENTS = Object.freeze({
  INVESTOR_HANDOFF: 'INVESTOR_HANDOFF',
  INVESTOR_PAGE_VIEWED: 'INVESTOR_PAGE_VIEWED',
  INVESTOR_SECTION_VIEWED: 'INVESTOR_SECTION_VIEWED',
  INVESTOR_DEMO_STARTED: 'INVESTOR_DEMO_STARTED',
  INVESTOR_DEMO_COMPLETED: 'INVESTOR_DEMO_COMPLETED',
  INVESTOR_RETURN_VISIT: 'INVESTOR_RETURN_VISIT',
  INVESTOR_CONTACT_REQUESTED: 'INVESTOR_CONTACT_REQUESTED',
  INVESTOR_DATAROOM_REQUESTED: 'INVESTOR_DATAROOM_REQUESTED',
  INVESTOR_CONTACTED: 'INVESTOR_CONTACTED',
  INVESTOR_REPLY: 'INVESTOR_REPLY',
  INVESTOR_MEETING: 'INVESTOR_MEETING',
  INVESTOR_FOLLOWUP: 'INVESTOR_FOLLOWUP',
  INVESTOR_DILIGENCE: 'INVESTOR_DILIGENCE',
  INVESTOR_PASSED: 'INVESTOR_PASSED',
  INVESTOR_TERM_SHEET: 'INVESTOR_TERM_SHEET',
  INVESTOR_INVESTED: 'INVESTOR_INVESTED',
  INVESTOR_CLOSED: 'INVESTOR_CLOSED',
});

const PAGE_EVENTS = new Set([
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_PAGE_VIEWED,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_SECTION_VIEWED,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_DEMO_STARTED,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_DEMO_COMPLETED,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_RETURN_VISIT,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_CONTACT_REQUESTED,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_DATAROOM_REQUESTED,
]);

const MANUAL_EVENTS = new Set([
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_CONTACTED,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_REPLY,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_MEETING,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_FOLLOWUP,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_DILIGENCE,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_PASSED,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_TERM_SHEET,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_INVESTED,
  INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_CLOSED,
]);

const TERMINAL = new Set([
  INVESTOR_LIFECYCLE.PASSED,
  INVESTOR_LIFECYCLE.INVESTED,
  INVESTOR_LIFECYCLE.CLOSED,
]);

const DAY_MS = 24 * 60 * 60 * 1000;

export function isPageEngagementEvent(eventType) {
  return PAGE_EVENTS.has(String(eventType || ''));
}

export function isManualEngagementEvent(eventType) {
  return MANUAL_EVENTS.has(String(eventType || ''));
}

export function isKnownEngagementEvent(eventType) {
  return Object.values(INVESTOR_ENGAGEMENT_EVENTS).includes(String(eventType || ''));
}

export function utcDayKey(iso = new Date().toISOString()) {
  return String(iso).slice(0, 10);
}

export function trackingDedupeKey({ campaignId, eventType, occurredAt, sectionKey, idempotencyKey } = {}) {
  if (idempotencyKey) return String(idempotencyKey).slice(0, 180);
  if (eventType === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF) {
    return `investor_handoff:${campaignId}`;
  }
  if (eventType === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_PAGE_VIEWED) {
    return `investor_page_view:${campaignId}:${utcDayKey(occurredAt)}`;
  }
  if (eventType === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_SECTION_VIEWED) {
    return `investor_section:${campaignId}:${sectionKey || 'unknown'}:${utcDayKey(occurredAt)}`;
  }
  return `investor_eng:${campaignId}:${eventType}:${occurredAt || ''}`;
}

export function lifecycleFromEvent(event = {}) {
  const type = event.eventType;
  if (type === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_CONTACTED) return INVESTOR_LIFECYCLE.CONTACTED;
  if (type === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_REPLY) return INVESTOR_LIFECYCLE.REPLIED;
  if (type === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_MEETING) {
    return String(event.meetingPhase || '').toUpperCase() === 'COMPLETED'
      ? INVESTOR_LIFECYCLE.MEETING_COMPLETED
      : INVESTOR_LIFECYCLE.MEETING_SCHEDULED;
  }
  if (type === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_FOLLOWUP) return INVESTOR_LIFECYCLE.FOLLOW_UP;
  if (type === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_DILIGENCE) return INVESTOR_LIFECYCLE.DILIGENCE;
  if (type === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_PASSED) return INVESTOR_LIFECYCLE.PASSED;
  if (type === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_TERM_SHEET) return INVESTOR_LIFECYCLE.TERM_SHEET;
  if (type === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_INVESTED) return INVESTOR_LIFECYCLE.INVESTED;
  if (type === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_CLOSED) return INVESTOR_LIFECYCLE.CLOSED;
  if (type === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF) return INVESTOR_LIFECYCLE.HANDOFF_APPROVED;
  return null;
}

export function baselineLifecycle({ profile, pack, proposal, handoff } = {}) {
  if (handoff?.status === INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF) {
    return INVESTOR_LIFECYCLE.HANDOFF_APPROVED;
  }
  if (proposal?.status === 'APPROVED' || pack) return INVESTOR_LIFECYCLE.PROPOSAL_READY;
  if (profile) return INVESTOR_LIFECYCLE.QUALIFIED;
  return INVESTOR_LIFECYCLE.RESEARCHING;
}

export function deriveLifecycle({ profile, pack, proposal, handoff, events = [] } = {}) {
  const material = [...events]
    .filter((e) => lifecycleFromEvent(e) && !isPageEngagementEvent(e.eventType))
    .sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')));
  const progressed = material.filter((e) => e.eventType !== INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF);
  const last = (progressed.length ? progressed : material).at(-1);
  if (last) return lifecycleFromEvent(last);
  return baselineLifecycle({ profile, pack, proposal, handoff });
}

function addDays(iso, days) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + days * DAY_MS).toISOString();
}

function lastActivityAt({ events = [], profile, handoff } = {}) {
  const stamps = [
    ...(events || []).map((e) => e.occurredAt || e.recordedAt),
    profile?.updatedAt,
    handoff?.approvedAt,
  ].filter(Boolean);
  stamps.sort();
  return stamps[stamps.length - 1] || null;
}

export function buildNextAction({ lifecycle, events = [], profile, handoff, now = new Date() } = {}) {
  const last = [...events]
    .filter((e) => !isPageEngagementEvent(e.eventType))
    .sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')))
    .at(-1);
  const lastAt = last?.occurredAt || handoff?.approvedAt || profile?.updatedAt || now.toISOString();
  const humanDue = last?.dueAt || null;
  let recommendedAction = 'No automatic next step. Record real-world progression manually.';
  let dueAt = humanDue;
  let founderActionRequired = false;

  if (lifecycle === INVESTOR_LIFECYCLE.HANDOFF_APPROVED) {
    recommendedAction =
      'Record outreach only after the founder actually contacted the investor. Handoff is not CONTACTED.';
    dueAt = humanDue || addDays(lastAt, 3);
    founderActionRequired = true;
  } else if (lifecycle === INVESTOR_LIFECYCLE.CONTACTED) {
    recommendedAction = 'Follow up if no reply has been recorded.';
    dueAt = humanDue || addDays(lastAt, 7);
    founderActionRequired = true;
  } else if (lifecycle === INVESTOR_LIFECYCLE.REPLIED) {
    recommendedAction = 'Prepare founder meeting.';
    dueAt = humanDue || addDays(lastAt, 3);
    founderActionRequired = true;
  } else if (lifecycle === INVESTOR_LIFECYCLE.MEETING_SCHEDULED) {
    recommendedAction = 'Prepare for the meeting. Meeting intelligence (1I) is not enabled.';
    dueAt = humanDue || lastAt;
    founderActionRequired = true;
  } else if (lifecycle === INVESTOR_LIFECYCLE.MEETING_COMPLETED || lifecycle === INVESTOR_LIFECYCLE.FOLLOW_UP) {
    recommendedAction = 'Record follow-up or requested evidence. Do not send automatically.';
    dueAt = humanDue || addDays(lastAt, 7);
    founderActionRequired = true;
  } else if (lifecycle === INVESTOR_LIFECYCLE.DILIGENCE || lifecycle === INVESTOR_LIFECYCLE.TERM_SHEET) {
    recommendedAction = 'Founder review of diligence / terms. No autonomous negotiation.';
    dueAt = humanDue || addDays(lastAt, 7);
    founderActionRequired = true;
  } else if (TERMINAL.has(lifecycle)) {
    recommendedAction = 'Closed. No outreach action.';
    founderActionRequired = false;
  } else if (lifecycle === INVESTOR_LIFECYCLE.PROPOSAL_READY || lifecycle === INVESTOR_LIFECYCLE.QUALIFIED) {
    recommendedAction = 'Prepare profile / outreach pack for founder review.';
    founderActionRequired = true;
  }

  return {
    recommendedAction,
    dueAt,
    lastEventType: last?.eventType || (handoff?.status === INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF
      ? INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF
      : null),
    lastEventAt: last?.occurredAt || handoff?.approvedAt || null,
    lastEventLabel: last?.note || last?.eventType || null,
    lifecycle,
    source: EVIDENCE_KIND.AI_INTERPRETATION,
    founderActionRequired,
    rationale:
      'Recommended next action is heuristic interpretation from recorded events. It is not a source fact and does not send communication.',
  };
}

export function attentionReasons({
  lifecycle,
  events = [],
  profile,
  handoff,
  access,
  nextAction,
  now = new Date(),
} = {}) {
  const reasons = [];
  if (TERMINAL.has(lifecycle)) return reasons;
  const nowMs = now.getTime();
  if (nextAction?.founderActionRequired) {
    const dueMs = nextAction.dueAt ? new Date(nextAction.dueAt).getTime() : NaN;
    if (
      lifecycle === INVESTOR_LIFECYCLE.HANDOFF_APPROVED ||
      lifecycle === INVESTOR_LIFECYCLE.CONTACTED ||
      lifecycle === INVESTOR_LIFECYCLE.REPLIED ||
      lifecycle === INVESTOR_LIFECYCLE.FOLLOW_UP ||
      (Number.isFinite(dueMs) && dueMs <= nowMs)
    ) {
      reasons.push('FOUNDER_FOLLOWUP');
    }
  }
  if (lifecycle === INVESTOR_LIFECYCLE.MEETING_SCHEDULED) reasons.push('MEETING_PREP');
  const profileAt = profile?.updatedAt ? new Date(profile.updatedAt).getTime() : null;
  if (profileAt && nowMs - profileAt > 14 * DAY_MS) reasons.push('STALE_RESEARCH');
  const pageViewed = events.some((e) => e.eventType === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_PAGE_VIEWED);
  const contacted = events.some((e) => e.eventType === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_CONTACTED);
  if (
    access?.hasToken &&
    !access?.revokedAt &&
    handoff?.status === INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF &&
    !pageViewed &&
    !contacted
  ) {
    reasons.push('TOKEN_NO_ENGAGEMENT');
  }
  const activity = lastActivityAt({ events, profile, handoff });
  if (activity && nowMs - new Date(activity).getTime() > 7 * DAY_MS) reasons.push('STALE_7D');
  return [...new Set(reasons)];
}

export function emptyTrackingDoc() {
  return {
    kind: INVESTOR_TRACKING_KIND,
    lifecycle: INVESTOR_LIFECYCLE.RESEARCHING,
    events: [],
    updatedAt: new Date().toISOString(),
  };
}

export function buildTrackingSnapshot({
  profile,
  pack,
  proposal,
  handoff,
  access,
  tracking,
  now = new Date(),
} = {}) {
  const events = Array.isArray(tracking?.events) ? tracking.events : [];
  const lifecycle = deriveLifecycle({ profile, pack, proposal, handoff, events });
  const nextAction = buildNextAction({ lifecycle, events, profile, handoff, now });
  return {
    kind: INVESTOR_TRACKING_KIND,
    lifecycle,
    events,
    nextAction,
    attention: attentionReasons({ lifecycle, events, profile, handoff, access, nextAction, now }),
    inferredContactedFromHandoff: false,
    sends: false,
    liveMeta: false,
  };
}

export function summarizeInvestorPipeline(rows = []) {
  const pipeline = Object.fromEntries(Object.values(INVESTOR_LIFECYCLE).map((k) => [k, 0]));
  const attention = {
    FOUNDER_FOLLOWUP: 0,
    MEETING_PREP: 0,
    STALE_RESEARCH: 0,
    TOKEN_NO_ENGAGEMENT: 0,
    STALE_7D: 0,
  };
  const needsAttention = [];
  for (const row of rows) {
    const life = row.lifecycle || INVESTOR_LIFECYCLE.RESEARCHING;
    if (pipeline[life] != null) pipeline[life] += 1;
    const reasons = row.attention || [];
    for (const reason of reasons) {
      if (attention[reason] != null) attention[reason] += 1;
    }
    if (reasons.length) {
      needsAttention.push({
        campaignId: row.campaignId,
        investorName: row.investorName,
        lifecycle: life,
        reasons,
        nextAction: row.nextAction?.recommendedAction || row.nextAction || null,
        dueAt: row.nextAction?.dueAt || null,
        founderActionRequired: row.nextAction?.founderActionRequired || reasons.includes('FOUNDER_FOLLOWUP'),
      });
    }
  }
  return {
    pipeline,
    attention,
    needsAttention,
    note: 'Counts are descriptive. They do not imply causality. Empty buckets are not urgency.',
  };
}

export function normalizeManualEventInput(input = {}, ctx = {}) {
  const eventType = String(input.eventType || '').trim();
  if (!isKnownEngagementEvent(eventType) || isPageEngagementEvent(eventType)) {
    return { ok: false, error: 'invalid_event_type' };
  }
  if (eventType === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF) {
    return { ok: false, error: 'handoff_not_manual' };
  }
  if (!isManualEngagementEvent(eventType)) {
    return { ok: false, error: 'invalid_event_type' };
  }
  const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString();
  if (occurredAt === 'Invalid Date' || Number.isNaN(new Date(occurredAt).getTime())) {
    return { ok: false, error: 'invalid_occurred_at' };
  }
  const meetingPhase =
    eventType === INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_MEETING
      ? String(input.meetingPhase || 'SCHEDULED').toUpperCase() === 'COMPLETED'
        ? 'COMPLETED'
        : 'SCHEDULED'
      : null;
  return {
    ok: true,
    event: {
      eventType,
      occurredAt,
      recordedAt: new Date().toISOString(),
      recordedBy: ctx.actorId || null,
      source: 'MANUAL',
      recordKind: 'HUMAN_RECORD',
      note: input.note ? String(input.note).slice(0, 2000) : null,
      meetingPhase,
      dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null,
      sectionKey: null,
      sends: false,
      inferredContacted: false,
    },
  };
}

export function normalizePageEventInput(input = {}) {
  const eventType = String(input.eventType || INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_PAGE_VIEWED).trim();
  if (!isPageEngagementEvent(eventType)) return { ok: false, error: 'invalid_event_type' };
  const occurredAt = new Date().toISOString();
  return {
    ok: true,
    event: {
      eventType,
      occurredAt,
      recordedAt: occurredAt,
      recordedBy: null,
      source: 'PAGE',
      recordKind: 'FIRST_PARTY',
      note: null,
      meetingPhase: null,
      dueAt: null,
      sectionKey: input.sectionKey ? String(input.sectionKey).slice(0, 80) : null,
      sends: false,
      inferredContacted: false,
      visitorIdentity: false,
    },
  };
}
