import { describe, expect, it } from 'vitest';
import { EVIDENCE_KIND } from '../researchContract.js';
import { INVESTOR_HANDOFF_STATES } from '../investorEngagementContract.js';
import {
  INVESTOR_ENGAGEMENT_EVENTS,
  INVESTOR_LIFECYCLE,
  attentionReasons,
  buildNextAction,
  buildTrackingSnapshot,
  deriveLifecycle,
  lifecycleFromEvent,
  trackingDedupeKey,
} from '../investorEngagementTrackingContract.js';

describe('investorEngagementTrackingContract', () => {
  it('does not treat INVESTOR_HANDOFF as CONTACTED', () => {
    expect(lifecycleFromEvent({ eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF })).toBe(
      INVESTOR_LIFECYCLE.HANDOFF_APPROVED,
    );
    expect(lifecycleFromEvent({ eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_CONTACTED })).toBe(
      INVESTOR_LIFECYCLE.CONTACTED,
    );
    const lifecycle = deriveLifecycle({
      handoff: { status: INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF },
      events: [
        {
          eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF,
          occurredAt: '2026-08-17T00:00:00.000Z',
        },
      ],
    });
    expect(lifecycle).toBe(INVESTOR_LIFECYCLE.HANDOFF_APPROVED);
    expect(lifecycle).not.toBe(INVESTOR_LIFECYCLE.CONTACTED);
  });

  it('does not let a later HANDOFF event override CONTACTED', () => {
    const lifecycle = deriveLifecycle({
      handoff: { status: INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF },
      events: [
        { eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_CONTACTED, occurredAt: '2026-08-17T10:00:00.000Z' },
        { eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF, occurredAt: '2026-08-17T20:00:00.000Z' },
      ],
    });
    expect(lifecycle).toBe(INVESTOR_LIFECYCLE.CONTACTED);
  });

  it('ignores page views when deriving lifecycle', () => {
    const lifecycle = deriveLifecycle({
      handoff: { status: INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF },
      events: [
        { eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF, occurredAt: '2026-08-17T00:00:00.000Z' },
        { eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_PAGE_VIEWED, occurredAt: '2026-08-18T00:00:00.000Z' },
      ],
    });
    expect(lifecycle).toBe(INVESTOR_LIFECYCLE.HANDOFF_APPROVED);
  });

  it('labels next action as AI_INTERPRETATION', () => {
    const next = buildNextAction({
      lifecycle: INVESTOR_LIFECYCLE.REPLIED,
      events: [{ eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_REPLY, occurredAt: '2026-08-18T00:00:00.000Z' }],
    });
    expect(next.source).toBe(EVIDENCE_KIND.AI_INTERPRETATION);
    expect(next.recommendedAction).toMatch(/meeting/i);
    expect(next.founderActionRequired).toBe(true);
  });

  it('flags token shared without engagement, not as contacted', () => {
    const snap = buildTrackingSnapshot({
      handoff: { status: INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF, approvedAt: new Date().toISOString() },
      access: { hasToken: true, revokedAt: null },
      tracking: { events: [{ eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF, occurredAt: new Date().toISOString() }] },
    });
    expect(snap.lifecycle).toBe(INVESTOR_LIFECYCLE.HANDOFF_APPROVED);
    expect(snap.inferredContactedFromHandoff).toBe(false);
    expect(attentionReasons({
      lifecycle: snap.lifecycle,
      events: snap.events,
      handoff: { status: INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF },
      access: { hasToken: true, revokedAt: null },
      nextAction: snap.nextAction,
    })).toContain('TOKEN_NO_ENGAGEMENT');
  });

  it('dedupes page views per campaign-day', () => {
    const a = trackingDedupeKey({
      campaignId: 'camp1',
      eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_PAGE_VIEWED,
      occurredAt: '2026-08-17T10:00:00.000Z',
    });
    const b = trackingDedupeKey({
      campaignId: 'camp1',
      eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_PAGE_VIEWED,
      occurredAt: '2026-08-17T22:00:00.000Z',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/investor_page_view:camp1:2026-08-17/);
  });
});
