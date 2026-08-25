/**
 * Suggested replies from product truth. Never claims a destination that is unavailable.
 * Does not send externally.
 */

import { getCardbeyCapabilityRegistry } from '../marketingOperator/capabilityRegistry.js';
import { createTrackedHandoff } from './trackedHandoff.js';
import { recommendedAction } from './intentClassifier.js';

const BLOCKED_REPLY =
  /guaranteed (revenue|roi|invest)|official meta partner|fully autonomous|investment advice/i;

function fallbackNoLink(language) {
  return language === 'vi'
    ? 'Cảm ơn bạn. Cardbey đang chuẩn bị pilot này. Chúng tôi có thể liên hệ lại khi đăng ký mở.'
    : 'Thanks — Cardbey is currently preparing this pilot. We can follow up when registration opens.';
}

function templates(language, intent) {
  const vi = language === 'vi';
  const map = {
    CREATE_BUSINESS: vi
      ? 'Cardbey có thể giúp bạn bắt đầu. Bạn có thể tiếp tục tại đây: {link}'
      : 'Cardbey can help you get started. You can continue here: {link}',
    GLOBAL_LIVE_EOI: vi
      ? 'Cảm ơn bạn đã quan tâm. Bạn có thể đăng ký quan tâm pilot tại đây: {link}'
      : 'Thanks for your interest. You can register your interest for the pilot here: {link}',
    SUPPLIER_PARTNERSHIP: vi
      ? 'Cảm ơn bạn đã quan tâm pilot Việt Nam → Australia. Bạn có thể tiếp tục với Cardbey tại đây: {link}'
      : 'Thanks for your interest in the Vietnam → Australia pilot. You can continue with Cardbey here: {link}',
    PARTNERSHIP: vi
      ? 'Cảm ơn bạn đã quan tâm hợp tác. Bạn có thể tìm hiểu Cardbey tại đây: {link}'
      : 'Thanks for your interest in partnering. You can continue with Cardbey here: {link}',
    SELL_PRODUCT: vi
      ? 'Cardbey đang hỗ trợ SME bán sản phẩm trong pilot. Bạn có thể tiếp tục tại đây: {link}'
      : 'Cardbey can help you get started selling with the pilot. You can continue here: {link}',
    SHOWCASE_SERVICE: vi
      ? 'Bạn có thể bắt đầu giới thiệu dịch vụ trên Cardbey tại đây: {link}'
      : 'You can continue showcasing your service with Cardbey here: {link}',
    GENERAL_INTEREST: vi
      ? 'Cảm ơn bạn đã quan tâm Cardbey (nền tảng tạo doanh nghiệp hỗ trợ AI đang phát triển). Tiếp tục tại đây: {link}'
      : 'Thanks for your interest in Cardbey, an AI business creation platform under development. Continue here: {link}',
    SMART_PRODUCT: vi
      ? 'Cardbey đang phát triển năng lực sản phẩm. Bạn có thể tiếp tục tại đây: {link}'
      : 'Cardbey is under development for this capability. You can continue here: {link}',
    MARKET_ENTRY: vi
      ? 'Cardbey đang chạy pilot SME. Bạn có thể tìm hiểu tại đây: {link}'
      : 'Cardbey is running an early SME pilot. You can continue here: {link}',
    SUPPORT: vi
      ? 'Cảm ơn bạn đã liên hệ. Một thành viên đội ngũ sẽ xem và phản hồi. Cardbey không gửi tin nhắn tự động.'
      : 'Thanks for reaching out. A teammate will review this. Cardbey does not send automated replies.',
    NOT_RELEVANT: vi
      ? 'Cảm ơn bạn. Nội dung này có vẻ không liên quan đến pilot Cardbey hiện tại.'
      : 'Thanks. This does not look related to the current Cardbey pilot.',
    UNKNOWN: vi
      ? 'Cảm ơn bạn đã liên hệ. Một thành viên đội ngũ sẽ xem tin nhắn này.'
      : 'Thanks for getting in touch. A teammate will review this message.',
  };
  return map[intent] || map.UNKNOWN;
}

function buildPreviewHandoff({ destination, interaction, intent, language }) {
  if (!destination?.available || !destination.url) return null;
  const built = createTrackedHandoff({
    baseUrl: destination.url,
    campaignId: interaction.campaignId,
    contentId: interaction.contentId || interaction.postId,
    channel: interaction.channel || 'facebook',
    provider: interaction.provider || 'facebook',
    interactionId: interaction.id,
    intent,
    language,
    correlationId: interaction.id,
    source: interaction.provider || 'facebook',
  });
  return built.ok ? built : null;
}

/**
 * @param {{ intent: string, language: string, destination: object, interaction: object }} input
 */
export function buildSuggestedReply(input = {}) {
  const registry = getCardbeyCapabilityRegistry();
  const language = input.language === 'vi' ? 'vi' : 'en';
  const intent = String(input.intent || 'UNKNOWN');
  const destination = input.destination || { available: false };
  const action = recommendedAction(intent, destination.available === true);
  const handoff = buildPreviewHandoff({
    destination,
    interaction: input.interaction || {},
    intent,
    language,
  });

  let reply;
  if (!destination.available || !handoff?.url) {
    reply = intent === 'SUPPORT' || intent === 'NOT_RELEVANT' || intent === 'UNKNOWN'
      ? templates(language, intent)
      : fallbackNoLink(language);
  } else {
    reply = templates(language, intent).replace('{link}', handoff.url);
  }

  if (BLOCKED_REPLY.test(reply)) {
    reply = fallbackNoLink(language);
  }

  return {
    reply,
    recommendedAction: action,
    destination,
    handoffPreview: handoff
      ? { url: handoff.url, params: handoff.params, issued: false }
      : null,
    productTruth: {
      positioning: registry.positioning,
      liveMetaVerified: false,
      humanApprovalRequired: true,
    },
    sendsExternally: false,
  };
}
