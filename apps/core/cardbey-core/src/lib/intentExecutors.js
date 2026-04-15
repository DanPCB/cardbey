/**
 * v0 intent executors: task-linked runs that produce artifacts/campaign_proposal only.
 * No external API calls. Used when dispatch is from a MissionTask with intent in INTENT_V0_SET.
 */

import { createAgentMessage } from '../orchestrator/lib/agentMessage.js';

export const INTENT_V0_SET = new Set([
  'create_canva_brief',
  'generate_post_calendar',
  'ads_plan_weeks_2_4',
  'setup_weekly_reporting',
  'lead_followup_playbook',
]);

/**
 * Run the appropriate intent handler and post artifact/campaign_proposal. Lifecycle messages
 * (running/completed/failed) are posted by the caller (agentRunExecutor).
 *
 * @param {string} missionId
 * @param {string} intent
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function runIntentExecutor(missionId, intent) {
  const handler = INTENT_HANDLERS[intent];
  if (!handler) {
    return { ok: false, error: `Unknown intent: ${intent}` };
  }
  try {
    await handler(missionId);
    return { ok: true };
  } catch (err) {
    const msg = err?.message || String(err);
    return { ok: false, error: msg.slice(0, 500) };
  }
}

async function handleCreateCanvaBrief(missionId) {
  await createAgentMessage({
    missionId,
    senderId: 'planner',
    senderType: 'agent',
    channel: 'main',
    text: 'Canva design brief created',
    messageType: 'artifact',
    payload: {
      title: 'Canva design brief',
      mimeType: 'application/json',
      doc: {
        sizes: ['1080x1080', '1080x1920', '1200x628'],
        copyBlocks: [
          { id: 'headline', placeholder: 'Headline', maxLength: 60 },
          { id: 'body', placeholder: 'Body copy', maxLength: 200 },
          { id: 'cta', placeholder: 'Call to action', maxLength: 30 },
        ],
        notes: 'Use brand colours and clear hierarchy. Export as PNG for social.',
      },
    },
    visibleToUser: true,
  });
}

async function handleGeneratePostCalendar(missionId) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      day: d.toISOString().slice(0, 10),
      caption: `Post ${i + 1} – theme TBD`,
      hashtags: ['#brand', '#campaign'],
    };
  });
  const csv = [
    'day,caption,hashtags',
    ...days.map((r) => `${r.day},"${r.caption.replace(/"/g, '""')}","${(r.hashtags || []).join(' ')}"`),
  ].join('\n');
  await createAgentMessage({
    missionId,
    senderId: 'planner',
    senderType: 'agent',
    channel: 'main',
    text: '14-day post calendar created',
    messageType: 'artifact',
    payload: {
      title: '14-day post calendar',
      mimeType: 'text/csv',
      sheet: { rows: days },
      raw: csv,
    },
    visibleToUser: true,
  });
}

async function handleAdsPlanWeeks2_4(missionId) {
  await createAgentMessage({
    missionId,
    senderId: 'planner',
    senderType: 'agent',
    channel: 'main',
    text: 'Ads plan (weeks 2–4)',
    messageType: 'campaign_proposal',
    payload: {
      title: 'Ads plan – weeks 2 to 4',
      sections: [
        { heading: 'Objectives', body: 'Increase reach and conversions in weeks 2–4 with targeted placements.' },
        { heading: 'Channels', body: 'Meta, Google Display; budget split 60/40.' },
        { heading: 'Creative cadence', body: 'Refresh creative weekly; A/B test two variants per placement.' },
      ],
    },
    visibleToUser: true,
  });
  await createAgentMessage({
    missionId,
    senderId: 'planner',
    senderType: 'agent',
    channel: 'main',
    text: 'Ads checklist created',
    messageType: 'artifact',
    payload: {
      title: 'Ads launch checklist',
      mimeType: 'application/json',
      checklist: [
        'Set up campaigns in Meta Ads Manager',
        'Upload creative and copy',
        'Define audiences and budget',
        'Schedule weeks 2–4',
        'Enable tracking and UTM params',
      ],
    },
    visibleToUser: true,
  });
}

async function handleSetupWeeklyReporting(missionId) {
  await createAgentMessage({
    missionId,
    senderId: 'planner',
    senderType: 'agent',
    channel: 'main',
    text: 'Weekly reporting template created',
    messageType: 'artifact',
    payload: {
      title: 'Weekly report template',
      mimeType: 'application/json',
      reportTemplate: {
        sections: ['Summary', 'Metrics', 'Wins', 'Blockers', 'Next week'],
        metrics: ['Reach', 'Engagement', 'Conversions', 'Spend'],
        schedule: 'weekly',
      },
    },
    visibleToUser: true,
  });
}

async function handleLeadFollowupPlaybook(missionId) {
  await createAgentMessage({
    missionId,
    senderId: 'planner',
    senderType: 'agent',
    channel: 'main',
    text: 'Lead follow-up playbook created',
    messageType: 'artifact',
    payload: {
      title: 'Lead follow-up playbook',
      mimeType: 'application/json',
      doc: {
        workflow: ['Day 0: Welcome email', 'Day 1: Value touchpoint', 'Day 3: Case study', 'Day 5: Soft CTA', 'Day 7: Check-in'],
        scripts: [
          { step: 'Welcome', script: 'Thanks for your interest. Here’s a quick overview of how we can help…' },
          { step: 'Value', script: 'Here’s a short case study that matches your situation…' },
          { step: 'CTA', script: 'When would be a good time for a 15-minute call this week?' },
        ],
      },
    },
    visibleToUser: true,
  });
}

const INTENT_HANDLERS = {
  create_canva_brief: handleCreateCanvaBrief,
  generate_post_calendar: handleGeneratePostCalendar,
  ads_plan_weeks_2_4: handleAdsPlanWeeks2_4,
  setup_weekly_reporting: handleSetupWeeklyReporting,
  lead_followup_playbook: handleLeadFollowupPlaybook,
};
