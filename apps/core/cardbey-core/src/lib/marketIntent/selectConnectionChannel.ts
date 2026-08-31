import type { ExternalMarketSignal } from './types.js';
import type {
  ConnectionChannel,
  ConnectionExecutionMode,
  ContactTarget,
} from './connectionTypes.js';
import { isSocialOriginatedSignal } from './resolveContactTarget.js';

export type ChannelSelection = {
  recommendedChannel: ConnectionChannel;
  alternativeChannels: ConnectionChannel[];
  executionMode: ConnectionExecutionMode;
  channelAvailability: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
  reason: string;
};

export function selectConnectionChannel(params: {
  signal: ExternalMarketSignal;
  contactTarget: ContactTarget | null;
  emailExecutionAvailable: boolean;
}): ChannelSelection {
  const { signal, contactTarget, emailExecutionAvailable } = params;
  const socialOrigin = isSocialOriginatedSignal(signal);

  if (!contactTarget) {
    return {
      recommendedChannel: 'MANUAL_CONTACT',
      alternativeChannels: ['CARDBEY_LINK'],
      executionMode: 'UNAVAILABLE',
      channelAvailability: 'UNAVAILABLE',
      reason: 'No verified contact target — cannot plan direct outreach',
    };
  }

  if (contactTarget.type === 'email' && contactTarget.verified) {
    if (emailExecutionAvailable) {
      return {
        recommendedChannel: 'EMAIL',
        alternativeChannels: ['CARDBEY_LINK', 'MANUAL_CONTACT'],
        executionMode: 'DIRECT_EXECUTABLE',
        channelAvailability: 'AVAILABLE',
        reason: 'Verified business email with authorized send path',
      };
    }
    return {
      recommendedChannel: 'EMAIL',
      alternativeChannels: ['CARDBEY_LINK', 'MANUAL_CONTACT'],
      executionMode: 'MANUAL_HANDOFF',
      channelAvailability: 'PARTIAL',
      reason: 'Verified email exists but automated send not authorized — manual handoff',
    };
  }

  if (contactTarget.type === 'email' && !contactTarget.verified) {
    return {
      recommendedChannel: 'EMAIL',
      alternativeChannels: ['CARDBEY_LINK', 'MANUAL_CONTACT'],
      executionMode: 'MANUAL_HANDOFF',
      channelAvailability: 'PARTIAL',
      reason: 'Email found but not sufficiently verified for automated send',
    };
  }

  if (socialOrigin) {
    return {
      recommendedChannel: 'ORIGINAL_SOCIAL_CONTEXT',
      alternativeChannels: ['CARDBEY_LINK', 'MANUAL_CONTACT'],
      executionMode: 'MANUAL_HANDOFF',
      channelAvailability: 'PARTIAL',
      reason: 'Social-originated signal — Cardbey cannot auto-DM; manual handoff required',
    };
  }

  if (contactTarget.type === 'website' || contactTarget.type === 'phone') {
    return {
      recommendedChannel: 'MANUAL_CONTACT',
      alternativeChannels: ['CARDBEY_LINK'],
      executionMode: 'MANUAL_HANDOFF',
      channelAvailability: 'PARTIAL',
      reason: 'Contact via website/phone requires human action outside Cardbey',
    };
  }

  return {
    recommendedChannel: 'CARDBEY_LINK',
    alternativeChannels: ['MANUAL_CONTACT'],
    executionMode: 'PUBLISH_AND_SHARE',
    channelAvailability: 'AVAILABLE',
    reason: 'Share tracked Cardbey destination — no direct contact channel',
  };
}
