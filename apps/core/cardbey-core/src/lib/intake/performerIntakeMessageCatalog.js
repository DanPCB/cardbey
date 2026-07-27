/**
 * Centralized bilingual strings for Performer Intake V2 responses.
 * Option values / tool names stay English; only user-facing copy is localized here.
 */

import { normalizeLocale } from '../localePrompt.js';

/** @type {Record<string, { en: string, vi: string }>} */
const MESSAGES = {
  signInToContinue: {
    en: 'Please sign in to continue.',
    vi: 'Cần đăng nhập để tiếp tục.',
  },
  signInToAddProducts: {
    en: 'Sign in to add products to your draft store. Your draft is saved — signing in links it to your account.',
    vi: 'Đăng nhập để thêm sản phẩm vào cửa hàng nháp. Bản nháp đã được lưu — đăng nhập sẽ liên kết với tài khoản của bạn.',
  },
  guestDraftAddProductClarify: {
    en: 'Could you please provide more details about the product you want to add? This will help me assist you better.',
    vi: 'Bạn có thể cho mình thêm chi tiết về sản phẩm muốn thêm không? Điều đó giúp mình hỗ trợ bạn tốt hơn.',
  },
  guestDraftAddProductCatalogOption: {
    en: 'Add a product to my catalog',
    vi: 'Thêm sản phẩm vào danh mục',
  },
  guestDraftAddProductSomethingElse: {
    en: 'I meant something else',
    vi: 'Ý tôi là việc khác',
  },
  approvalReviewConfirm: {
    en: 'Review the preview below, then confirm to run.',
    vi: 'Xem lại bên dưới và xác nhận trước khi chạy.',
  },
  weakImageClassifierHint: {
    en: '\n\n[System: an image is attached but OCR extracted no readable text (or the image could not be decoded). Prefer executionPath chat with tool analyze_content when the user asks what is in the image; otherwise invite them to describe it. Do not reply as if no image was provided.]',
    vi: '\n\n[Hệ thống: có ảnh đính kèm nhưng OCR không đọc được chữ (hoặc không có ảnh hợp lệ). Ưu tiên executionPath chat với tool analyze_content nếu người dùng muốn hiểu nội dung hình; hoặc mời họ mô tả ảnh. Đừng trả lời như thể không có ảnh.]',
  },
  missingToolSelection: {
    en: 'Missing tool selection.',
    vi: 'Thiếu lựa chọn công cụ.',
  },
  invalidToolSelection: {
    en: 'That selection is no longer valid.',
    vi: 'Lựa chọn không hợp lệ.',
  },
  whatWouldYouLikeToDo: {
    en: 'What would you like to do?',
    vi: 'Bạn muốn làm gì?',
  },
  clarifyCreateRunway: {
    en: 'Do you want an online store with products, or a mini website / landing page?',
    vi: 'Bạn muốn cửa hàng trực tuyến hay trang web mini?',
  },
  optionOnlineStoreCatalog: {
    en: 'Online store / product catalog',
    vi: 'Cửa hàng / danh mục sản phẩm',
  },
  optionMiniWebsite: {
    en: 'Mini website / landing page',
    vi: 'Trang web mini / landing page',
  },
  signInSmartDocument: {
    en: 'Please sign in to create a smart document.',
    vi: 'Đăng nhập để tạo tài liệu thông minh.',
  },
  smartDocumentStarted: {
    en: 'Started creating your {{docType}}…',
    vi: 'Đang tạo {{docType}} của bạn…',
  },
  signInCreateCard: {
    en: 'Please sign in to create an intelligent card.',
    vi: 'Đăng nhập để tạo thẻ thông minh.',
  },
  cardMissionStarted: {
    en: 'Started creating your card…',
    vi: 'Đang tạo thẻ của bạn…',
  },
  posterUpdated: {
    en: 'Poster updated.',
    vi: 'Đã cập nhật poster.',
  },
  posterGenerateFailed: {
    en: 'Could not generate poster.',
    vi: 'Không thể tạo poster.',
  },
  posterCreatedFor: {
    en: 'Created a promotional poster for {{businessName}}.',
    vi: 'Đã tạo poster quảng cáo cho {{businessName}}.',
  },
  signInAutomatedStore: {
    en: 'Please sign in to start an automated store build from your message.',
    vi: 'Đăng nhập để tự động tạo cửa hàng từ tin nhắn của bạn.',
  },
  heroImageRequiresStore: {
    en: 'Select a store first — then I can update your hero image.',
    vi: 'Chọn cửa hàng trước, rồi mình có thể cập nhật ảnh hero cho bạn.',
  },
  capabilityGapProposal: {
    en: 'This may need a small product extension. Review the proposal below — nothing has been applied yet.',
    vi: 'Yêu cầu này có thể cần mở rộng sản phẩm. Xem đề xuất bên dưới (chỉ xem trước — chưa thay đổi gì).',
  },
  needMoreDetail: {
    en: 'I need a bit more detail to run that safely.',
    vi: 'Tôi cần thêm chi tiết để tiếp tục.',
  },
  confirmPolicyProceed: {
    en: 'Should I go ahead with "{{label}}"?',
    vi: 'Xác nhận giúp mình nhé?',
  },
  dispatchActionFailed: {
    en: 'I could not complete that action. Please try again.',
    vi: 'Không thể thực hiện. Thử lại sau.',
  },
  storeCheckpointWebsite: {
    en: 'A few quick choices before we build your mini website for "{{businessName}}"…',
    vi: 'Một vài lựa chọn nhanh trước khi tạo trang web mini cho "{{businessName}}"…',
  },
  storeCheckpointStore: {
    en: 'A few quick choices before we build "{{businessName}}"…',
    vi: 'Một vài lựa chọn nhanh trước khi tạo cửa hàng cho "{{businessName}}"…',
  },
  storeBuildingWebsite: {
    en: 'Started building your mini website for "{{businessName}}"…',
    vi: 'Đang tạo trang web mini cho "{{businessName}}"…',
  },
  storeBuildingStore: {
    en: 'Started building your store for "{{businessName}}"…',
    vi: 'Đang tạo cửa hàng cho "{{businessName}}"…',
  },
  campaignCheckpointStarted: {
    en: 'A few quick choices before we build your campaign…',
    vi: 'Một vài lựa chọn nhanh trước khi tạo chiến dịch của bạn…',
  },
  campaignBuilding: {
    en: 'Started building your campaign…',
    vi: 'Đang tạo chiến dịch của bạn…',
  },
  campaignRequiresStore: {
    en: 'Select a store first — then I can launch your campaign.',
    vi: 'Chọn cửa hàng trước, rồi mình có thể chạy chiến dịch cho bạn.',
  },
  pickAnOption: {
    en: "I'm not sure — pick an option:",
    vi: 'Bạn muốn chọn hướng nào?',
  },
  defaultChatUnclear: {
    en: "I'm not sure how to help with that. Could you give me more details?",
    vi: 'Bạn có thể mô tả thêm không?',
  },
  heroUpdateGuidance: {
    en: 'I can help update your hero image with a concrete step — select a store or describe the image you want.',
    vi: 'Mình có thể cập nhật ảnh hero qua các bước cụ thể — hãy chọn cửa hàng hoặc mô tả ảnh bạn muốn.',
  },
  planBuildFailed: {
    en: 'I could not build a valid plan from that.',
    vi: 'Chưa đủ bước cho kế hoạch.',
  },
  rephraseRequest: {
    en: 'Could you rephrase that?',
    vi: 'Thử mô tả khác nhé?',
  },
  missingApprovalReference: {
    en: 'Missing approval reference.',
    vi: 'Thiếu mã xác nhận.',
  },
  approvalExpired: {
    en: 'This approval expired. Please run the request again.',
    vi: 'Xác nhận đã hết hạn. Hãy thử lại từ đầu.',
  },
  approvalSessionForbidden: {
    en: 'You cannot confirm this approval in this session.',
    vi: 'Không thể xác nhận với phiên này.',
  },
  approvalContextFailed: {
    en: 'We could not confirm with the current context. Check your store selection or try again.',
    vi: 'Không thể xác nhận với ngữ cảnh hiện tại. Kiểm tra cửa hàng hoặc thử lại.',
  },
  actionCompleted: {
    en: 'Completed.',
    vi: 'Đã hoàn tất.',
  },
  actionFailedRetry: {
    en: 'Could not complete the action. Please try again.',
    vi: 'Không thể hoàn tất. Thử lại sau.',
  },
};

/**
 * @param {string} key
 * @param {unknown} locale
 * @param {Record<string, string>} [vars]
 */
export function intakeMessage(key, locale, vars = {}) {
  const loc = normalizeLocale(locale);
  const entry = MESSAGES[key];
  const template = entry?.[loc] ?? entry?.en ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    vars[name] != null ? String(vars[name]) : '',
  );
}

export { MESSAGES as PERFORMER_INTAKE_MESSAGES };
