/**
 * Curated Vietnamese fixes by full i18n key (translation.* / dashboard.*).
 * Used for high-confidence previews before glossary / LLM.
 */
export const CURATED_VI_FIXES = {
  'translation.nav.chat-video-studio': {
    fixed: 'Video Studio',
    confidence: 0.92,
    explanation: 'Keep product nav label aligned with English brand surface "Video Studio".',
  },
  'translation.nav.chat-canvas': {
    fixed: 'Chat Canvas',
    confidence: 0.92,
    explanation: 'Keep product nav label aligned with English brand surface "Chat Canvas".',
  },
  'translation.pwa.installBenefit': {
    fixed: 'Truy cập nhanh hơn, toàn màn hình, dùng như một ứng dụng.',
    confidence: 0.95,
    explanation: 'Already correct Vietnamese; do not apply typo variants like "thành hơn".',
  },
  'translation.pwa.installDescription': {
    fixed:
      'Thêm Cardbey vào màn hình chính để dùng toàn màn hình trên điện thoại và máy tính.',
    confidence: 0.9,
    explanation: 'Standard PWA install copy.',
  },
  'translation.inspector.guest.completeCheckpoints': {
    fixed:
      'Hoàn thành các bước kiểm tra trong chat. Quá trình tạo cửa hàng tự động bắt đầu sau khi bạn xác nhận.',
    confidence: 0.95,
    explanation: 'Inspector guest checkpoint guidance.',
  },
};

export function lookupCuratedFix(fullKey) {
  if (!fullKey) return null;
  return CURATED_VI_FIXES[fullKey] ?? null;
}
