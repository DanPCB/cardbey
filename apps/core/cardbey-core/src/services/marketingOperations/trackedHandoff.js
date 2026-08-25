/**
 * Provider-neutral tracked Cardbey destination / handoff helper.
 * Reuses existing UTM + campaignId conventions (no shortener, no login required).
 */

import { ATTRIBUTION_WINDOWS } from '../marketingOperator/constants.js';
import { CHANNELS, CANONICAL_EVENTS } from './constants.js';

/**
 * @param {object} args
 * @returns {{ ok: boolean, url?: string, params?: object, error?: string }}
 */
export function createTrackedHandoff(args = {}) {
  const base = String(args.baseUrl || args.destination || '').trim();
  if (!base) {
    return { ok: false, error: 'baseUrl_required' };
  }
  let url;
  try {
    url = new URL(base);
  } catch {
    return { ok: false, error: 'invalid_baseUrl' };
  }

  const channel = String(args.channel || CHANNELS.FACEBOOK);
  const provider = String(args.provider || channel);
  const source = String(args.source || provider || channel);
  const campaignId = args.campaignId ? String(args.campaignId) : '';
  const contentId = args.contentId || args.postId ? String(args.contentId || args.postId) : '';
  const interactionId = args.interactionId ? String(args.interactionId) : '';
  const intent = args.intent ? String(args.intent) : '';
  const language = args.language ? String(args.language) : '';

  if (campaignId) url.searchParams.set('campaignId', campaignId);
  if (contentId) url.searchParams.set('contentId', contentId);
  if (channel) url.searchParams.set('channel', channel);
  if (source) url.searchParams.set('source', source);
  if (args.placement) url.searchParams.set('placement', String(args.placement));
  if (args.creativeVersion != null) {
    url.searchParams.set('creativeVersion', String(args.creativeVersion));
  }
  if (interactionId) url.searchParams.set('interactionId', interactionId);
  if (intent) url.searchParams.set('intent', intent);
  if (language) url.searchParams.set('lang', language);
  if (args.correlationId) url.searchParams.set('correlationId', String(args.correlationId));

  const utmSource = String(args.utmSource || source || channel || 'facebook');
  const utmMedium = String(args.utmMedium || 'social');
  const utmCampaign = String(args.utmCampaign || campaignId || '');
  const utmContent = String(args.utmContent || contentId || '');
  if (utmSource) url.searchParams.set('utm_source', utmSource);
  if (utmMedium) url.searchParams.set('utm_medium', utmMedium);
  if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign);
  if (utmContent) url.searchParams.set('utm_content', utmContent);
  if (!url.searchParams.get('source')) url.searchParams.set('source', utmSource);
  if (utmCampaign && !url.searchParams.get('campaign')) {
    url.searchParams.set('campaign', utmCampaign);
  }

  url.searchParams.set('cb_attr', '1');
  url.searchParams.set('cb_click_window_d', String(ATTRIBUTION_WINDOWS.CLICK_DAYS));
  url.searchParams.set('cb_view_window_d', String(ATTRIBUTION_WINDOWS.VIEW_DAYS));
  url.searchParams.set('cb_event', CANONICAL_EVENTS.CARDBEY_HANDOFF);

  return {
    ok: true,
    url: url.toString(),
    eventHint: CANONICAL_EVENTS.CARDBEY_HANDOFF,
    windows: { ...ATTRIBUTION_WINDOWS },
    params: {
      campaignId: campaignId || null,
      contentId: contentId || null,
      channel,
      provider,
      source,
      interactionId: interactionId || null,
      intent: intent || null,
      language: language || null,
      correlationId: args.correlationId ? String(args.correlationId) : null,
      utmSource,
      utmMedium,
      utmCampaign: utmCampaign || null,
      utmContent: utmContent || null,
    },
  };
}
