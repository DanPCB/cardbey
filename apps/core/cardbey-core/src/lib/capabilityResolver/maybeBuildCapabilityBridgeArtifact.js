function trim(x) {
  return typeof x === 'string' ? x.trim() : '';
}

function shortPreview(x, max = 180) {
  const s = trim(x);
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

function stableBridgeId({ missionId, capabilityFamily, userMessage }) {
  const mid = trim(missionId) || 'no_mission';
  const fam = trim(capabilityFamily) || 'unknown';
  const msg = trim(userMessage) || 'no_msg';
  // Not cryptographic; just stable enough for UI keys.
  const base = `${mid}:${fam}:${msg.slice(0, 48)}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return `bridge_${mid}_${h.toString(16)}`;
}

function suggestedActionsForFamily(family, locale) {
  const loc = locale === 'vi' ? 'vi' : 'en';
  const mk = (id, label, intentText) => ({ id, label, intentText });
  switch (family) {
    case 'service_request':
      return [
        mk(
          'provide_details',
          loc === 'vi' ? 'Bổ sung chi tiết' : 'Add details',
          loc === 'vi'
            ? 'Tôi cần dịch vụ này. Khu vực, thời gian và ngân sách của tôi là:'
            : 'I need this service. My area, timing, and budget are:',
        ),
      ];
    case 'document_understanding':
      return [
        mk('summarize', loc === 'vi' ? 'Tóm tắt nội dung' : 'Summarize', loc === 'vi' ? 'Tóm tắt tài liệu này' : 'Summarize this document'),
        mk(
          'extract_fields',
          loc === 'vi' ? 'Trích thông tin' : 'Extract key fields',
          loc === 'vi' ? 'Trích các thông tin quan trọng (tên, số, ngày, tổng tiền)' : 'Extract key fields (names, dates, totals)',
        ),
      ];
    case 'image_understanding':
      return [
        mk(
          'describe',
          loc === 'vi' ? 'Mô tả ảnh' : 'Describe image',
          loc === 'vi' ? 'Mô tả ngắn gọn những gì trong ảnh này' : 'Give a short description of what’s in this image',
        ),
      ];
    case 'research':
      return [
        mk(
          'refine_research',
          loc === 'vi' ? 'Tinh chỉnh yêu cầu' : 'Refine request',
          loc === 'vi' ? 'Tôi muốn nghiên cứu thị trường về:' : 'I want market research on:',
        ),
      ];
    default:
      return [];
  }
}

/**
 * Build a lightweight "capability bridge" payload for the console UI.
 * This is an optional UX enhancement only; it must never crash intake.
 */
export function maybeBuildCapabilityBridgeArtifact(input) {
  try {
    const capabilityResolution = input?.capabilityResolution;
    const family = trim(capabilityResolution?.family);
    if (!family) return null;

    // Only emit bridge for families that benefit from a guided next step.
    const allowed = new Set(['service_request', 'document_understanding', 'image_understanding', 'research']);
    if (!allowed.has(family)) return null;

    const locale = input?.locale === 'vi' ? 'vi' : 'en';
    const userMessage = trim(input?.userMessage);
    const missionId = trim(input?.missionId);
    const extractedSnippet = trim(input?.extractedSnippet);
    const responseText = trim(input?.responseText);

    const bridgeId = stableBridgeId({
      missionId,
      capabilityFamily: family,
      userMessage,
    });

    const kind =
      family === 'service_request'
        ? 'service_request'
        : family === 'document_understanding'
          ? 'document_analysis'
          : family === 'image_understanding'
            ? 'image_analysis'
            : 'research_result';

    const title =
      family === 'service_request'
        ? locale === 'vi'
          ? 'Yêu cầu dịch vụ'
          : 'Service request'
        : family === 'document_understanding'
          ? locale === 'vi'
            ? 'Phân tích tài liệu'
            : 'Document analysis'
          : family === 'image_understanding'
            ? locale === 'vi'
              ? 'Hiểu nội dung ảnh'
              : 'Image understanding'
            : locale === 'vi'
              ? 'Kết quả nghiên cứu'
              : 'Research result';

    const summary =
      shortPreview(responseText, 160) ||
      (locale === 'vi' ? 'Mình đã phân loại yêu cầu của bạn và đề xuất bước tiếp theo.' : 'I’ve classified your request and suggested a next step.');

    return {
      bridgeId,
      kind,
      capabilityFamily: family,
      title,
      summary,
      sourceContext: {
        ...(missionId ? { missionId } : {}),
        ...(userMessage ? { userQuestionPreview: shortPreview(userMessage, 120) } : {}),
        ...(extractedSnippet ? { extractedSnippet: shortPreview(extractedSnippet, 240) } : {}),
      },
      suggestedActions: suggestedActionsForFamily(family, locale),
      ...(family === 'service_request' && input?.serviceRequestDraft ? { serviceRequestDraft: input.serviceRequestDraft } : {}),
    };
  } catch {
    return null;
  }
}

